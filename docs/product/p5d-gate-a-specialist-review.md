# P5d Gate A — database / RLS specialist review

**Role:** database, RLS and migration specialist (read-only reviewer, instance 3).
**Gate:** A — write-policy repair.
**Reviewed:** commit `805358d` "fix(collections): add the missing write policies (P5d Gate A)" on branch `feat/p5d-collections`.
**Date:** 2026-07-29.
**Approval state: ✅ APPROVED (2026-07-29).** The original verdict on this
review was CHANGES REQUIRED, and it is preserved below in the body exactly as
written. The re-review verdict, the commit it was given against, and what
changed between them are appended at the end of this file under
"Re-review verdict". Read that section before acting on anything in the body.

> This is a review artifact, not a task log. The supervisor owns the consolidated
> task list; `docs/product/plus-build-progress.md` remains the single
> running-state record. Findings here feed those, they do not replace them.

---

## Summary

Migration `0121`'s SQL is **correct**, and this review proves it rather than
asserting it (see the red/green run below). What blocks Gate A is not the
policies:

1. The evidence artifact that is supposed to prove the repair **never runs**.
   `pnpm test:db` exits 0 with all ten tests skipped.
2. `discount_codes` carries the **identical defect**, unrepaired, already in
   production, on the revenue path.
3. `0121`'s own explanatory comment **certifies `discount_codes` as healthy**,
   which would hide (2) from the next engineer who looks.

Native discount parity was preserved cleanly in `0de2034` before branching. No
concerns there.

---

## Authorized scope addition (founder decision, 2026-07-29)

Finding A2 (`discount_codes`) belongs to **P5b**, which is already committed and
applied to production. The specialist flagged it as outside P5d's scope. The
founder has decided: **fold the `discount_codes` repair into
`feat/p5d-collections`.**

This is now in scope for the branch and for Gate A approval. The worker owns the
implementation; the specification is in A2 below and is deliberately complete
enough to apply without further design work.

**Do not copy `0121`'s three-policy shape.** See A2: `discount_codes` needs
`INSERT` and `UPDATE` only.

---

## Evidence inspected

- `0120` and `0121` SQL; canonical patterns in `0035_goods.sql` (ownership
  `FOR ALL`), `0026_restore_rls_policies.sql` (the house *repair* pattern),
  `0115`, `0118`.
- **Production, read-only.** A `begin transaction read only` session against the
  live database reading `pg_policies`, `pg_class.relrowsecurity`,
  `information_schema.role_table_grants`, FK delete rules and row counts.
  No data was modified. Catalog views only.
- Every write site for all 19 SELECT-only RLS-enabled tables, each traced to the
  Supabase client that actually reaches it (following cores back to their
  callers, since cores receive the client as a parameter).
- **Live execution** of `tests/db/collections-rls.test.ts` against real local
  Postgres with a real anon-key JWT, both with the `0121` policies present and
  with them dropped.

**Production matches the migration files exactly** for these tables. The
AGENTS.md divergence hazard (the 2026-05-10 incident) does not apply here, but
it was checked rather than assumed.

### Production facts recorded

| Fact | Value |
|---|---|
| `product_collections` policies in prod | exactly 1, `SELECT` only |
| `discount_codes` policies in prod | exactly 1, `SELECT` only |
| `products` / `product_variants` / `orders` | `FOR ALL` + `WITH CHECK` (correct) |
| `products.collection_id` FK delete rule | `confdeltype = 'n'` (ON DELETE SET NULL) |
| `product_collections` row count | **0** |
| `products.collection_id` non-null count | **0** |
| `products` total | 7 |
| Orphaned / cross-owner assignments | 0 / 0 |
| `anon` grants on `product_collections` | `INSERT, UPDATE, DELETE, TRUNCATE, SELECT, …` |

---

## The red/green proof (Gate A's missing evidence, supplied)

Reproduce with a local Supabase running (`supabase start`), env injected from
`.env.e2e`. **Policies dropped on the local DB to reproduce shipped production:**

```
× lets an owner INSERT their own collection
× lets an owner UPDATE their own collection
× lets an owner DELETE their own collection
× lets an owner REORDER their own collections
× lets an owner toggle visibility, which is the archive/restore shape
× cannot SELECT another artist's collection
× cannot UPDATE another artist's collection
× cannot re-assign a collection to itself via UPDATE
× cannot DELETE another artist's collection

AssertionError: new row violates row-level security policy
  for table "product_collections"   (code 42501)

Tests  9 failed | 1 passed (10)      EXIT=1
```

**Policies restored:**

```
Tests  10 passed (10)                EXIT=0
```

This establishes three things:

- the shipped defect was real, and its exact production failure mode is
  Postgres `42501`;
- `0121` genuinely repairs it;
- the test logic does discriminate — the defect is in the harness, not the SQL.

The local database was restored immediately and re-verified green.

---

## Findings

### CRITICAL — A1. The Gate A evidence artifact never runs

**Location:** `apps/web/vitest.db.config.ts` (no env loading) +
`apps/web/tests/db/collections-rls.test.ts:21-25`.

`pnpm test:db` reports `Tests 10 skipped (10)` and **exits 0**. `.env.e2e`
contains the correct local values (`http://127.0.0.1:54321` plus the anon and
service keys), but nothing loads it, so `LOCAL` is false and `describe.skipIf`
disables every test.

**Failure mode.** The single artifact required to prove the repair reports
success without executing one statement against a database. This is the same
green-by-vacuity failure that allowed `0120` to ship: a gate that cannot go red
is not a gate. The founder's requirement ("at least one test must use an
authenticated non-service database client and must fail when the write policy is
absent") is currently unmet, even though the test that would satisfy it exists.

**Required correction.** Load the environment in the config, reusing the house
pattern already at `playwright.config.ts:2,11`:

```ts
import { config as loadEnv } from "dotenv";
loadEnv({ path: path.join(__dirname, ".env.e2e"), override: true });
```

`override: true` is **not optional**: Vitest may already have `.env.local`
(which points at production) in `process.env`, and dotenv does not overwrite
variables that are already set. Without it the suite can silently keep skipping,
or worse, resolve to the wrong target. Then fail loudly rather than skip when no
target is configured, so an unconfigured run is visibly broken instead of
quietly green.

**Required verification evidence.** The red/green pair above, produced by the
worker on their own machine and pasted into `plus-build-progress.md`: drop the
three `0121` policies locally, show the suite failing with `42501`, restore, show
`10 passed`.

---

### HIGH — A2. `discount_codes` has the identical defect, unrepaired, in production

**Location:** `apps/web/supabase/migrations/0118_goods_discounts.sql:50-53`.
Writers: `apps/web/src/app/(artist)/goods/discounts/actions.ts:18,31`
(`createClient`) and `apps/web/src/app/api/mobile/goods/discounts/route.ts:88,135`
via `apps/web/src/lib/server/mobile-auth.ts:37` (anon key + bearer token).

Production-verified: `discount_codes` has exactly one policy, `SELECT` only,
while **both** write surfaces use a user-scoped client. Creating, editing or
activating a discount code fails with `42501` on web and native alike.

**Currently masked**, which is why nobody has reported it: `discount-write.ts:59`
refuses on entitlement before reaching the database, and no artist is entitled
while Plus is dark. It becomes live breakage on the revenue path the moment
`goods_discounts` is granted at launch.

**Required correction.** Its own forward migration plus a sibling RLS regression
test. **Folded into this branch by founder decision (2026-07-29).**

#### Exactly which verbs, and why not `DELETE`

Every `discount_codes` operation in the codebase, with its client:

| Verb | Site | Client | Policy needed |
|---|---|---|---|
| SELECT | `goods/discounts/page.tsx:17` | user-scoped | exists (`0118`) |
| SELECT | `api/mobile/goods/discounts/route.ts:28` | user-scoped | exists (`0118`) |
| SELECT | `lib/server/discounts.ts:91` (checkout) | `serviceClient` | n/a, bypasses RLS |
| INSERT | `lib/server/discount-write.ts:146` | user-scoped | **missing** |
| UPDATE | `lib/server/discount-write.ts:141` (edit) | user-scoped | **missing** |
| UPDATE | `lib/server/discount-write.ts:178` (activate/deactivate) | user-scoped | **missing** |
| DELETE | *none anywhere* | — | **must not be added** |

There is no delete path, by explicit product decision recorded at
`discount-write.ts:172-174`: *"Deliberately not a delete: a code an artist
published is a promise, and its redemption history is what a sales report is made
of."* Adding a `DELETE` policy would hand the database permission for an
operation the product refuses, and would quietly enable destroying rows that
`discount_redemptions` references. Grant `INSERT` and `UPDATE`, nothing more.

This is the one place the `discount_codes` repair must **not** mirror `0121`.

#### Migration SQL (house pattern: `0026` guards, `TO authenticated`, idempotent)

```sql
-- Repair: discount_codes had no write policies (Plus build P5b).
--
-- Same defect and same cause as 0121: 0118 created the table with RLS enabled
-- and a SELECT policy only, while every write path runs on the USER-scoped
-- client. Creating, editing or activating a code fails with 42501 on web
-- (goods/discounts/actions.ts) and native (api/mobile/goods/discounts/route.ts)
-- alike. It has been latent since 7e504db because the entitlement gate at
-- discount-write.ts:59 refuses before the database is reached, and nobody is
-- entitled while Plus is dark. It becomes live at launch.
--
-- 0118 is already applied to production and is never edited; this is
-- forward-only.
--
-- INSERT and UPDATE only. There is deliberately no delete path for a discount
-- code (discount-write.ts:172-174): a published code is a promise, and its
-- redemption history is what a sales report is made of. No DELETE policy.

drop policy if exists "artist inserts own discount codes" on discount_codes;
drop policy if exists "artist updates own discount codes" on discount_codes;

create policy "artist inserts own discount codes" on discount_codes
  for insert to authenticated
  with check (artist_id = auth.uid());

create policy "artist updates own discount codes" on discount_codes
  for update to authenticated
  using (artist_id = auth.uid())
  with check (artist_id = auth.uid());
```

Take the next free migration number at the time of writing. **Coordinate with
the worker's Gate B join-table migration**, which will also want a number: this
review and the Gate B work share one working tree, and two files claiming the
same ordinal is a merge conflict at best and a skipped migration at worst.

#### Sibling regression test

`apps/web/tests/db/discounts-rls.test.ts`, mirroring the collections suite:
authenticated owner INSERT and UPDATE succeed; a second artist cannot SELECT,
UPDATE or insert-on-behalf-of the first; and an owner cannot reassign
`artist_id` to another artist (the `WITH CHECK` case). Do **not** add a delete
test asserting success; if anything, assert that an authenticated delete affects
zero rows, which pins the no-delete decision in the database.

**Required verification evidence.** The same drop/restore red-green as A1, run
against local: with the two policies absent the INSERT and UPDATE tests must fail
with `42501`; restored, the suite must pass. Both outputs into
`plus-build-progress.md`.

#### Two related observations (worker/supervisor call, not blocking)

- `setDiscountActiveCore` (`discount-write.ts:176`) never checks entitlement,
  unlike `saveDiscountCore` (`:59`). Same shape as `deleteCollectionCore`. Not
  reachable today (no codes can exist), but it is the same omission pattern.
- With RLS denying the insert, the `42501` lands in the generic
  `"Couldn't save. Try again."` branch at `discount-write.ts:157`, because only
  `23505` is special-cased. That is why the defect produced no diagnostic signal.

**Scope of the systemic sweep.** Of the 19 SELECT-only RLS-enabled tables,
exactly **two** are written through a user-scoped client: `product_collections`
and `discount_codes`. The other 17 (`projects`, `project_media`,
`discount_redemptions`, `support_tickets`, `support_ticket_messages`,
`location_claims`, `guest_spot_*`, `studio_*`, `welcome_pack_files`) write
exclusively via `serviceClient` and are **correct as designed**. Nothing older
than the Plus goods build is affected. The bug class is bounded and closable.

---

### HIGH — A3. `0121`'s comment certifies the still-broken table as healthy

**Location:** `0121_product_collections_write_policies.sql`, the paragraph
"WHY THE SHAPE DIFFERS FROM ITS SIBLINGS".

It states that `projects` **and `discount_codes`** are correctly SELECT-only
because "their writes go through the SERVICE client after an explicit ownership
check". That is true for `projects` (every write in `lib/server/projects.ts` is
on `serviceClient`, imported at line 3) and **false for `discount_codes`**, per
A2.

**Failure mode.** A repair migration is precisely the document the next engineer
reads when this bug class recurs. This one tells them the one table still broken
was deliberate. It converts a findable defect into an invisible one.

**Required correction.** Name `projects` only, and fold `discount_codes` into the
repair.

---

### MEDIUM — A4. `0121` is not idempotent and diverges from the house repair pattern

Three bare `create policy` statements. Postgres has no
`CREATE POLICY IF NOT EXISTS`, so a replay raises `42710 policy already exists`.
`0026_restore_rls_policies.sql:19-20` — written *because of* the prior RLS
incident — establishes the house pattern: `DROP POLICY IF EXISTS` before each
`CREATE`. `0121` is unapplied, so this costs nothing now and removes a failure
mode from any future replay or partial application.

---

### MEDIUM — A5. `0121` omits `TO authenticated` while `anon` holds write grants

Production-verified: `anon` holds `INSERT, UPDATE, DELETE` (and `TRUNCATE`) on
`product_collections`; these are the standard Supabase role grants. Not
exploitable as written, because `auth.uid()` is NULL for `anon`, so
`artist_id = NULL` evaluates to NULL and the row is denied. But the predicate is
then the *only* thing holding, and `0026` uses `TO authenticated` for exactly
this reason. Add `TO authenticated` to all three policies as defence in depth.

---

### MEDIUM — A6. The test re-implements a weaker production guard the repo already owns

`tests/db/collections-rls.test.ts:24` uses `/127\.0\.0\.1|localhost/`, while
`tests/e2e/helpers/env.ts:14-37` already exports `assertSafeTarget`, which
rejects the production project ref `llmzzsmppaqwecbrowlp` and the hosts
`inklee.app` / `inkl.ee`, including subdomains, with a deliberate no-override
policy.

This suite creates and deletes **real auth users**. That guard is the only thing
standing between a misconfigured shell and user creation on a live project, and
duplicating it weaker violates the one-source-of-truth rule. Call
`assertSafeTarget` on the resolved URL in addition to the localhost allowlist:
allowlist for intent, `assertSafeTarget` for the known-bad list.

---

### LOW — A7. `vitest.db.config.ts` documents a guarantee it does not implement

Line 15 claims "the config refuses to point anywhere else". The config contains
no guard of any kind. Fixing A1 in the config is the natural place to make the
claim true; otherwise correct the comment.

### LOW — A8. One cross-account test passes vacuously

`"refuses an INSERT that names someone else as the owner"` was the **single test
that still passed with all write policies dropped**. It asserts only
`error !== null`, so it accepts the wrong error for the wrong reason and cannot
distinguish "cross-account insert rejected" from "all inserts rejected". Assert
on the cross-account rejection specifically.

### LOW — A9. The suite sits in no automated gate

`vitest.config.ts:19` includes `src/**` only, so `pnpm test` never collects
`tests/db/`. It is absent from the pre-commit hook and from `ci.yml`. `.env.e2e`
is gitignored, so CI needs provisioned local-Supabase values before this can run
there. Until it is wired into a gate, the next occurrence of this bug class is
equally invisible. Fixing A1 without A9 fixes this instance, not the mechanism.

---

## Advance notes for Gate B (not blocking Gate A)

- **The backfill is empty.** `product_collections` = 0 rows,
  `products.collection_id` non-null = 0, zero orphaned and zero cross-owner
  assignments. This materially de-risks the expand/migrate/verify/contract
  sequence. It also means a green backfill run proves nothing on its own:
  equivalence must be demonstrated against **seeded synthetic data** covering
  multi-collection membership, dangling `collection_id`, and per-collection
  ordering.
- **RLS precedent for the join table.** `product_variants` already solves the
  "child table with no `artist_id`" case in this schema with `FOR ALL` plus an
  `EXISTS` subquery against the parent. That is the house answer and it is
  preferable to a denormalized `artist_id`, which introduces a column that can
  drift from its parents.
- **Cross-ownership is the trap.** A denormalized `artist_id` with `WITH CHECK`
  does **not** prevent a row pairing artist A's collection with artist B's
  product; both halves satisfy the check. Only composite foreign keys
  (`(collection_id, artist_id)` and `(product_id, artist_id)` referencing unique
  parent keys) make that state unrepresentable. Full treatment at Gate B.
- **FK behaviour confirmed:** `products.collection_id` is `ON DELETE SET NULL`
  (`confdeltype = 'n'`) in production, matching `0120`'s stated intent.

---

## Re-review checklist for Gate A approval

- [ ] A1 — `vitest.db.config.ts` loads `.env.e2e` with `override: true`; an
      unconfigured target fails rather than skips.
- [ ] A1 — red/green evidence pasted into `plus-build-progress.md`.
- [ ] A2 — forward migration adding `INSERT` + `UPDATE` (no `DELETE`) policies to
      `discount_codes`, with a sibling RLS test. **In scope for this branch by
      founder decision, 2026-07-29.**
- [ ] A3 — `0121` comment corrected to name `projects` only.
- [ ] A4 — `DROP POLICY IF EXISTS` before each `CREATE POLICY`.
- [ ] A5 — `TO authenticated` on all three policies.
- [ ] A6 — `assertSafeTarget` called in the db suite.
- [ ] A7, A8, A9 — resolved or explicitly accepted.

Gate A passes on the red/green pair once A1, A3, A4 and A5 are fixed and A2 has
landed as its own migration.

---

## Reviewer conduct

Read-only throughout. No repository files were edited (the `pg` driver and helper
scripts live in the session scratchpad, outside the repo). Production was
accessed only inside `begin transaction read only`, reading catalog views; no
production data was read beyond aggregate counts, and none was modified. The
three write policies were dropped and restored on the **local** 127.0.0.1
instance only, behind a hard host guard that refuses any non-local target, and
the local database was re-verified green afterwards.

---

# Re-review verdict — APPROVED

**Appended:** 2026-07-29, by the docs and record-integrity role.
**Verdict:** ✅ **APPROVED.**
**Given against:** `ca2b09c` `docs(p5d): record the named-list red run closing Gate A`, on `feat/p5d-collections`. That commit is the one carrying the named-per-test red run that closed the gate; the code and migration state it reviewed is `7679a0f` (the N1/N2 correction set) plus its parents back through `f090956`.
**Original verdict:** CHANGES REQUIRED (see the head of this file), issued against `805358d`.

**Provenance of this artifact.** The review itself was performed by the database/RLS specialist role during the 2026-07-29 three-role session. This section was written afterwards by the docs role to give a deploy-authorising gate a durable artifact, because it had none: the verdict existed only in session context, in commit messages (`7679a0f`, `ca2b09c`, `201fbfc`) and in `plus-build-progress.md`. **The docs role did not execute the review and did not re-run the evidence.** Every claim below is sourced to a commit or to the running log, and is cited as such. Where the record is incomplete, that is stated rather than filled in.

## The path from CHANGES REQUIRED to APPROVED

The gate did not pass quietly. It went to CHANGES REQUIRED **twice**.

**Round 1 (against `805358d`).** Nine findings, A1-A9, listed in the body of this file. All nine resolved; the resolution table and its red/green evidence are in `docs/product/plus-build-progress.md` under "Gate A review response". The two that mattered most:

- **A1 (CRITICAL).** `pnpm test:db` loaded no env, so all ten tests SKIPPED and the suite exited 0 having asserted nothing. The evidence artifact meant to prove the repair never ran. Fixed so an unconfigured target FAILS rather than skips.
- **A2 (HIGH).** `discount_codes` carried the identical defect, unrepaired, **already in production, on the revenue path**. Repaired by `0123`, which the founder then cherry-picked ahead of this branch and shipped (`add324a`).

**Round 2, the escalation (this is the part worth reading).** After A1-A9 were resolved, the re-review pulled on the policy-arithmetic thread and escalated **back to CHANGES REQUIRED** on two new HIGH findings, both in `collection-items-rls.test.ts` — a Gate B file that had never been in Gate A's original scope. The migrations needed no changes. The tests protecting them **could not fail**:

- **N1 (HIGH).** Three cross-account tests asserted only `expect(error).not.toBeNull()`. With the INSERT policy entirely absent, "everything is rejected" satisfies that assertion exactly as well as "cross-account is rejected". This is the same vacuous-pass shape finding A8 had already fixed once, on a sibling file, never swept here.
- **N2 (HIGH).** Four tests discarded a write's result with no destructuring at all, so a silent RLS rejection was invisible and the final assertion was satisfied by *nothing having been written*.

An **eighth** could-not-fail test was then found by independent audit in a file the reviewer had already cleared (`collections-rls.test.ts`, `cannot re-assign a collection to itself via UPDATE`, same bare `not.toBeNull()` shape). Per `7679a0f`: the audit was run rather than inherited, and `discounts-rls.test.ts` checked clean.

**What closed it.** A **named per-test** red run, three rounds, `vitest --reporter=verbose`. The hardened requirement was explicitly that aggregate counts are not acceptable evidence, because aggregates are exactly what let the original defect through: "18 failed | 13 skipped" cannot tell anyone WHICH tests failed. Recorded in `ca2b09c` and in `plus-build-progress.md` under "Gate A closing: named-list red run":

- **Round A**, dropping `product_collection_items`'s three write policies: 11 of 36 failed, named. N1's three targets and N2's four targets all failed for the right reason, plus four collateral failures individually explained rather than left as noise.
- **Round B**, restoring and instead dropping the two composite FKs: reproduced the earlier red run's same 4 failures with the same codes (`null`, `undefined`, never `23505`). **N1's three tests correctly stayed GREEN in this round**, which is the other half of the proof: RLS rejects those rows before the FK is ever consulted, so removing the FK must not change their outcome.
- **Final round:** 36/36, named, all green.

An error code was verified rather than assumed along the way, and contradicted the review's own hypothesis: all three N1 cases return `42501` (RLS), not `23503` (FK), because `WITH CHECK` is evaluated for a non-service-role client before the composite FK is consulted. Recorded as verified, not silently matched.

## Re-review checklist — final state

The checklist in the body of this file is left unticked as the historical artifact of round 1. Its final state:

| Item | State | Where the evidence is |
|---|---|---|
| A1 config loads `.env.e2e`, unconfigured fails not skips | ✅ | `plus-build-progress.md`, "A1 evidence" (both the failing and passing runs pasted) |
| A1 red/green pasted into `plus-build-progress.md` | ✅ | same section, superseded by the stronger named-list run |
| A2 forward migration for `discount_codes` + sibling test | ✅ **and SHIPPED TO PRODUCTION** | `0123`; `add324a` on `origin/master`; `tests/db/discounts-rls.test.ts`, 8 tests |
| A3 `0121` comment corrected to name `projects` only | ✅ | `f090956` |
| A4 `DROP POLICY IF EXISTS` before each `CREATE POLICY` | ✅ | re-proven by full reset from zero |
| A5 `TO authenticated` on all policies | ✅ | 9 policies across `0121`/`0122`/`0123` |
| A6 `assertSafeTarget` called in the db suite | ✅ | `tests/db/helpers/db-env.ts` |
| A7, A8, A9 | ✅ | A9 wired the suite into CI (`e2e` job) and `test:launch` |
| N1, N2, N2-minor (round 2, not in the original checklist) | ✅ | `7679a0f`; named red run in `ca2b09c` |

## Scope this verdict does NOT cover

Stated explicitly so nobody reads an approved Gate A as an approved branch:

- **Gate A covers the write-policy repair.** Milestones 3-6 are **Gate C** (`p5d-gate-c-review.md`). The branch's base commit `0de2034` is **`p5d-base-commit-review.md`**.
- **`0124` and the `deleteCollectionCore` TOCTOU are NOT in this gate.** `0124` was written after this verdict. Its TOCTOU is **open**, reproduced three times, and `0124` does not close it.
- **Approving Gate A does not authorise a merge.** Merging is deploying. See the ordering constraint in `plus-build-progress.md` and `docs/roadmap.md` §1: `0121`, `0122` and `0124` must be applied and **catalog-verified** before the merge, and `0123` must not be re-applied.

## The durable rule this gate produced

**A claim needs behavioural evidence when its truth depends on a SEQUENCE or a STATE TRANSITION.** A linear read does not settle those. Three claims in this gate were true on inspection and false in execution, and all three were temporal: a suite that exited 0 having asserted nothing (A1), tests that could not fail (A8, N1, N2, and the eighth), and a migration certified "idempotent" that restored nothing on replay (task #14). None of them were wrong on a single read.

Corollary, now house style: **never write a comment asserting a safety property you have not executed.** `0124`'s retracted "nothing can happen between eligible and gone" is the counter-example that proves the rule, and it was written after this gate closed.
