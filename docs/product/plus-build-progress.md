# Plus build: live progress log

**Purpose:** a supervisor-readable status file, updated as work happens, so
progress can be monitored without interrupting implementation. The PLAN lives
in `plus-build-plan.md`; this file is the running state of executing it.

Last updated: 2026-07-29 (second docs pass). All six P5d milestones BUILT on
`feat/p5d-collections`. **Gate A is APPROVED and Gate C came back clean.**
`0123` is IN PRODUCTION (`add324a`, cherry-picked ahead of the branch by founder
decision, now the tip of `origin/master`). `0121`, `0122` and `0124` are still
branch-local; `goods_collections` stays ungranted; nothing else is activated.

> **🔁 RECONCILED AGAINST GIT 2026-07-31. Most of this file is now history, not
> current state.** P5d IS merged to master (`99e39e1`); the collections work
> above shipped. Since then the branch `feat/p5d-collections` has advanced to
> **35 commits ahead of `origin/master` (`c69c95a`), tree clean**, migrations to
> **0132**, carrying the rest of the Plus build: appointment payments full
> lifecycle (0125-0128), P6 analytics + savings (0130), C1-C7 billing fixes,
> Stage-5 commercial closure, image_gallery, bundles + payable decomposition
> (0132), PAY-RFD-002 fix (0131), billing retention (0129). Anything below that
> says "P5b not started", "bundles unstarted", or "analytics unwired" is STALE.
> Re-derive from git (`git log --oneline origin/master..HEAD`), not from this
> log. Current decision + status SoT: `docs/product/plus-open-decisions-handoff.md`
> (status snapshot) and `docs/product/plus-build-time-decisions.md` (reasoning).
> **Operating model as of 2026-07-31: NO DEFERRAL — build the complete product
> now behind gates, one consolidated review at the end.**

> **Correction, this pass.** The line above previously read "Gate A findings
> resolved; **awaiting specialist re-review**. Nothing pushed to master."
> Both halves were false by the time they were read. Recorded rather than
> deleted, per house style. Evidence: `git log -1 --format=%H origin/master`
> returns `add324ab8b4bdd9824138fd5f610b934354ad8db`, whose subject is
> `fix(goods): discount_codes had no write policies, blocking every artist save`;
> `git branch -r --contains add324a` returns `origin/master`.

**This file is the designated running SoT and it kept going stale faster than it
was read.** Three separate passes have now had to correct it against `git`. If
you are about to trust a commit count, a migration count or a gate state written
here, re-derive it (`git rev-list --count origin/master..HEAD`,
`ls apps/web/supabase/migrations/*.sql | wc -l`, `git log -1 origin/master`)
before acting on it.

---

## Open task register (carried, not closed)

Recorded 2026-07-29 because these lived only in session context and nowhere on
disk. Each states the deferral REASON, so the next reader does not have to
re-derive whether the deferral was safe.

### Task #12 — `setDiscountActiveCore` is an ungated write. DEFERRED, non-blocker.

`apps/web/src/lib/server/discount-write.ts:170-188`. The function takes
`(supabase, artistId, id, active)` and goes straight to the `update`. There is
no `goodsDiscountsAllowed` / `getAccountOverrides` check anywhere in it, and
neither caller adds one: the web action
(`app/(artist)/goods/discounts/actions.ts:52-63`) and the mobile route
(`app/api/mobile/goods/discounts/route.ts:120-137`) both authenticate and then
call the core directly.

Its sibling `saveDiscountCore` DOES gate, at `discount-write.ts:59-65`
(`if (!goodsDiscountsAllowed(await getAccountOverrides(artistId)))` →
`not_entitled`). So the asymmetry is real, not imagined.

**Why this is not a privilege bypass, and therefore not blocking.** An
un-entitled artist who toggles an existing code back to `active: true` gains
nothing, because the gate is re-evaluated at APPLY time, not only at write time.
`resolveDiscount` (`apps/web/src/lib/server/discounts.ts:82-88`) checks
`goodsDiscountsAllowed(await getAccountOverrides(args.artistId))` before it ever
looks the code up, and returns `clientRejectionMessage("inactive")` when the
artist is not entitled. The code's `active` column can say whatever it likes; it
still takes no money off. The comment immediately above that check
(`discounts.ts:79-81`) states the design intent explicitly: "The gate is checked
on APPLY, not only on create: an artist who downgrades keeps their codes ... but
the codes stop taking money off." The capability-registry row for
`goods_discounts` (`docs/architecture/capability-registry.md:52`) says the same.

**Pre-existing, not introduced by this branch.**
`git log --oneline --diff-filter=A -- apps/web/src/lib/server/discount-write.ts`
→ `7e504db feat(goods): discount codes (Plus P5b)`, which is on `origin/master`.
`git log --oneline origin/master..HEAD -- apps/web/src/lib/server/discount-write.ts`
returns nothing: `feat/p5d-collections` does not touch the file.

**Second, separate defect in the same file, recorded here so it is not lost.**
`saveDiscountCore`'s error mapping only special-cases `23505` (unique violation
→ "You already have a code with that name."). Everything else falls through to
the generic `return { ok: false, code: "failed", error: "Couldn't save. Try again." }`
at `discount-write.ts:159`. That is the exact path a `42501` RLS rejection took,
which is why the production defect `0123` fixed presented for weeks as a
transient-sounding retry prompt on a permanent condition. `0123` removed the
*cause*; the *mapping* is unchanged, so the next permanent write failure on this
path will read the same way. Not fixed here (this is a docs-only pass).

### Task #18 — the Hub feature jobs swallow every error. DEFERRED, pre-existing house pattern.

`apps/web/src/lib/server/hub-feature-data.ts`. Four jobs are pushed onto the
`jobs` array, and all four end in a bare `.catch(() => {})`:

| Line | Job |
|---|---|
| `:70` | shop / product count + thumbs |
| `:112` | guest spots |
| `:174` | featured collections (added by this branch, `25dda4f`) |
| `:189` | flash count |

All four, no exceptions. This is deliberate and documented at the top of the
file (`:13-16`): "Every query is independently optional and every failure
degrades to 'no data', which the blocks render as nothing rather than as an
error: a link-in-bio page must never break because a shop query blipped."

**Pre-existing.** `git show origin/master:apps/web/src/lib/server/hub-feature-data.ts | grep -c "catch(() => {})"`
returns `3`. The branch added the fourth (`:174`) by following the pattern the
file already established, rather than by introducing it. Deferred on that basis:
changing it means changing the house pattern for the whole file at once, which is
a decision, not a fix. The cost is that a persistent failure in any of the four
is indistinguishable from "the artist has nothing here", with no Sentry breadcrumb.

### Task #15 — three DB tests. One of them is a MOCK and is in the wrong suite. A FOURTH is now needed.

The three pre-registered tests remain open. The correction that matters:

- **Test 1 is a MOCK.** It belongs in the UNIT suite
  (`apps/web/src/lib/server/__tests__/`), not in `apps/web/tests/db/`.
  `apps/web/tests/db/` is the authenticated-RLS gate: anon-key client plus a
  real JWT against a real Postgres, which must FAIL rather than skip when
  unconfigured (finding A1). A mocked test placed there inflates the DB count
  without exercising a single policy, which is precisely the failure shape this
  whole gate exists to prevent. Put it where its evidence value is honest.
- Tests 2 and 3 stay in `tests/db/`.
- **A fourth is now required: coverage of `delete_collection_if_eligible`,
  the `0124` RPC.** It currently has ZERO test coverage. The tell is in
  `9bb8d0a`'s own commit message: unit stayed at exactly 2028 and `test:db` at
  exactly 36 across a change that added a database function and rewrote its only
  caller. `deleteCollectionCore` is not exercised by any test at all. This is not
  optional bookkeeping: `collections.ts` now hard-depends on that function
  existing in the database (see the merge-ordering constraint below).

---

## Current objective

**Stage P5, goods tools.** Build the remaining commerce features behind the
Plus package. Everything lands dark or Free-invisible; consumer billing stays
closed throughout (DB-backed launch key untouched).

**P5d was rebuilt, not patched.** The completion claim in `d890a07` was wrong
and is retracted. All six milestones of the approved design are now built on
`feat/p5d-collections`: schema repair, many-to-many model, server behaviour,
Hub block, native management, docs.

Status: **built; Gate A APPROVED, Gate C clean.** The gate was not
self-approved: it went to a database/RLS specialist, came back CHANGES
REQUIRED twice, and only then passed. `goods_collections` stays ungranted.

> **Correction, 2026-07-29 (second docs pass).** This paragraph read "built,
> awaiting Gate A re-review. Nothing is pushed to master, migrations
> `0121`-`0123` are applied locally only". Two of those three claims are now
> false and are retracted here rather than silently overwritten:
> - Gate A is **approved** (see "Gate A closing: named-list red run" below, and
>   the appended verdict in `p5d-gate-a-specialist-review.md`).
> - `0123` **is pushed and is in production** as `add324a`, which is the tip of
>   `origin/master`. It was cherry-picked ahead of this branch by founder
>   decision.
>
> Still true, and now the load-bearing part: `0121`, `0122` and `0124` are
> branch-local only, and `goods_collections` is ungranted.

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
| `0123` hotfix | `add324a` | ✅ **IN PRODUCTION 2026-07-29.** `discount_codes` write policies. Cherry-picked ahead of `feat/p5d-collections` by founder decision; now the tip of `origin/master` |

Migrations 0114-0120 **and `0123`** are applied to production and verified
there. `0123` was verified against the **catalog, not the migration ledger**
(`pg_policies` returns SELECT + INSERT + UPDATE on `discount_codes`, no DELETE,
which is by design), per the standing AGENTS.md rule that the ledger can lie.

> **Correction, 2026-07-29 (second docs pass).** This line read "Migrations
> 0114-0120 are applied to production and verified there", which stopped being
> the whole truth the moment `add324a` was pushed. Retracted in place.

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

> **Superseded, 2026-07-29 (second docs pass), by a later event and not by an
> error.** The last sentence is no longer true. `origin/master` advanced to
> `add324a` when the `0123` hotfix was pushed; local `master` was not moved with
> it and still sits at `d890a07`. Verified: `git rev-parse master` →
> `d890a076c8590ab963f8f1eb97ec32d0b236a6f3`, `git rev-parse origin/master` →
> `add324ab8b4bdd9824138fd5f610b934354ad8db`. The relationship is still SAFE,
> which is the part that matters: `git merge-base --is-ancestor master origin/master`
> exits 0, so local `master` is strictly BEHIND the remote, carrying nothing of
> its own. Fast-forward it before doing anything with it.

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
out of master.**

> **Count correction, 2026-07-29 (second docs pass).** "the eight P5d-rebuild
> commits (`805358d` through `264ec6d`)" was accurate for that named RANGE and
> stays accurate as history: those eight are `805358d`, `fca49c4`, `f090956`,
> `8554e63`, `25dda4f`, `caa1be1`, `a261347`, `264ec6d`. It is no longer the
> whole branch. `git rev-list --count origin/master..HEAD` returns **16** at
> `32a15e8`, the tip at the time of writing. Do not treat any commit count in
> this file as current: re-derive it. The base-commit claim is unaffected and
> still holds; `0de2034` is still the oldest entry in
> `git log --oneline origin/master..HEAD`.
>
> **Resolved by the founder, 2026-07-29: NO REBASE.** `0de2034` rides in with
> the merge, and was brought into review scope instead. It was reviewed and came
> back clean. Artifact: `docs/product/p5d-base-commit-review.md`. The
> "still-open decision" language below is closed by that call. The moment `feat/p5d-collections` is merged, `0de2034` merges
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

### Milestone 2: Gate B, the collection model — DONE (`fca49c4`)

> **Correction, 2026-07-29 (second docs pass).** This heading read "Milestone 2
> (current)" while milestones 3, 4, 5 and 6 all carry "DONE" further down the
> same file, and Gate C has since reviewed 3-6 as a set. The "(current)" marker
> was left behind when the work moved on. Removed.

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

### Gate A review response — all findings resolved; re-review APPROVED

> **Correction, 2026-07-29 (second docs pass).** Heading read "awaiting
> re-review". The re-review happened, escalated to CHANGES REQUIRED on two new
> HIGH findings (N1/N2, below), was fixed, and then **APPROVED**. Verdict
> appended to `docs/product/p5d-gate-a-specialist-review.md`.

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

**Red/green on the policies themselves.** **Correction (L1, found during the
correction-set review):** this originally said "all nine write policies
dropped." Wrong wording: `0121`-`0123` created 9 policies total, but only 8 of
them are write policies (3 on `product_collections`, 3 on
`product_collection_items`, 2 on `discount_codes`); the 9th is
`product_collection_items`'s SELECT policy, a genuine new read policy on a new
table, not a leftover miscount. The original record does not say, and cannot
now be reconstructed after the fact, whether that historical drop included the
SELECT policy alongside the 8 write ones — the commands run at the time were
not preserved verbatim. Recorded here as an open gap rather than guessed at;
task #9's named-per-test red run replaces this ambiguity with an unambiguous,
freshly-verified record rather than trying to patch this one after the fact.

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

Local database reset from zero: all migrations apply clean in order.

> **Count correction, 2026-07-29 (second docs pass), applied to all three places
> this file said "124 migrations" (here, and twice in the red-run section
> below).** There have never been 124 migration files. The highest NUMBER is
> `0124`; the file COUNT is different, because the numbering starts at `0000`
> and because `0041` and `0042` do not exist. Verified:
>
> ```
> $ ls -1 apps/web/supabase/migrations/*.sql | wc -l
> 123
> $ for i in $(seq -w 0 124); do ls 0$i*.sql >/dev/null 2>&1 || echo "MISSING 0$i"; done
> MISSING 0041
> MISSING 0042
> ```
>
> 125 slots (`0000`-`0124`) minus 2 absent = **123 files**, all of them tracked
> (`git ls-files apps/web/supabase/migrations/*.sql | wc -l` → 123). At the time
> the "124" claim was written `0124` did not yet exist and the true figure was
> 122. Both numbers were wrong in the same direction, by treating the highest
> number as the count. `origin/master` carries 120 of them (it has `0120` and
> `0123` but not `0121`, `0122` or `0124`).

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
Retried immediately; the second attempt applied every migration then existing
(`0000`-`0123`, minus the absent `0041`/`0042`; the file above says
"`0001`-`0123`", which skips `0000`) cleanly, including the composite FK block
and the notice-skipped legacy objects, and finished. `pg_constraint` confirmed both FKs back, and:

```
$ pnpm test:db
◇ injected env (5) from .env.e2e
 Test Files  3 passed (3)
      Tests  36 passed (36)
```

36/36. The full reset also re-proves A4 more thoroughly than a single-file
replay would: EVERY migration, not just `0121`-`0123`, applied clean from
zero in one pass. (The original text said "all 124 migrations"; see the count
correction above. The claim's substance is unaffected, the number was wrong.)

### Correction set: N1/N2 test rigor, L1/L2/L6 (2026-07-29)

`db-reviewer` escalated to CHANGES REQUIRED after pulling on the
policy-arithmetic thread and finding two new HIGH findings, both inside
`collection-items-rls.test.ts` (Gate B, never in Gate A's original scope). The
migrations themselves needed no changes; the tests protecting them could not
fail.

**N1 (HIGH), fixed.** Three cross-account tests asserted only
`expect(error).not.toBeNull()`: `cannot file ANOTHER artist's product into its
own collection`, `cannot file its own product into ANOTHER artist's
collection`, `cannot claim a membership row by naming someone else as owner`.
With the INSERT policy entirely absent, "everything is rejected" satisfies
that assertion exactly as well as "cross-account is rejected" — the same
vacuous-pass shape A8 already fixed once, on a sibling file, never swept here.

Fixed by adding a same-owner positive control on a FRESH row before each (not
a reused one — the file already has a comment elsewhere about why reuse
produces a false pass from the wrong constraint), then asserting a specific
error code instead of non-null. **The code was verified empirically, not
assumed**, against the live local stack: all three actually return `42501`
(RLS rejection), not `23503` (foreign-key violation) as the review's own
hypothesis suggested for the two FK-parent-mismatch cases. Reasoned out after
the fact: `WITH CHECK` is evaluated for an authenticated, non-service-role
client before the composite FK is ever consulted, so RLS rejects the row on
its own `EXISTS` clauses or `artist_id` check first — the FK becomes the
active guarantee only once RLS is out of the picture, which is what the
service-role tests in "cross-ownership is unrepresentable" already exercise.
All three ended up the same code, so no test-name differentiation was needed;
recorded as verified rather than silently matching the hypothesis.

**Independent audit, as asked, not inherited.** Checked `collections-rls.test.ts`
and `discounts-rls.test.ts` myself for the same two patterns rather than
taking "clean" on trust.
- `discounts-rls.test.ts`: clean. Every write in the file destructures
  `{ data, error }` or `{ error }` explicitly and asserts on it, including two
  places that already assert specific codes (`42501` twice). No bare
  `not.toBeNull()`, no undestructured write.
- `collections-rls.test.ts`: clean of the discard pattern (N2) — every setup
  write is destructured for `data` and immediately dereferenced via `made!.id`,
  which throws loudly on a null/undefined result rather than passing
  vacuously; less explicit than checking `error` directly, but not exploitable
  the way N2's four named tests were. **Found one instance of the N1 pattern
  the review didn't name**: `cannot re-assign a collection to itself via
  UPDATE` used the same bare `not.toBeNull()`. Fixed it the same way — checked
  the setup insert's error, verified the real code empirically (`42501`,
  same `WITH CHECK` mechanism), and asserted that instead.

**N2 (HIGH), fixed.** Four tests discarded a write's result entirely (no
destructuring at all), so a silent RLS rejection was invisible and the final
assertion was satisfied by "nothing was ever written": `removes a product from
a collection without touching the product`, `cannot read another artist's
membership rows`, `cascades membership away when a product is hard-deleted`,
`deleting a collection removes membership but never the products`. Every
setup and mutation write in all four now captures `{ error }` and asserts
`toBeNull()` at the point of the call, so a failure surfaces where it happens.

**N2-minor (LOW), fixed.** `removes the mirrored row when the legacy column is
cleared` never confirmed the mirror existed BEFORE clearing, so its guarantee
was borrowed from a sibling test rather than proven locally. Added the
precondition assertion.

**All fixes verified green together:**
```
$ pnpm test:db
 Test Files  3 passed (3)
      Tests  36 passed (36)
```

**L1, fixed above** where the miscounted claim lived (see the correction
inline in the A4 evidence block above): 8 write + 1 read, not "nine write."

**L2 (git-history question), closed N/A.** Asked whether an already-installed
native build might still have a single-collection picker writing
`products.collection_id` directly, since native has no OTA. The commit range
that matters is the one actually shipped: `c00341a` (the commit behind
installed build `da93749b`) up to `d890a07` (current `origin/master`) — note
the review cited the range in the opposite order; corrected here after
checking `git merge-base --is-ancestor` both ways. `git log --oneline
c00341a..d890a07 -S"collection_id" -- apps/mobile` and the same search for
`collectionId` both return nothing, and `git grep` for either term against
`apps/mobile` AT `c00341a` itself also returns nothing. No native picker
writing `collection_id` ever existed on any build that shipped. N/A, checked
rather than assumed.

**L6 (idempotency), proven.** With `0121` applied, ran `0122` twice back to
back under `-v ON_ERROR_STOP=1` directly against the local stack: exit 0 both
times (all statements report `NOTICE ... skipping` or succeed; nothing
aborts). `pnpm test:db` after both runs: 36/36 green. This is a different
claim from the one found while restoring the dropped FKs during the red run
above (`0122` does not CONVERGE — replaying it cannot restore a constraint
someone dropped by hand, because the composite FKs live inside a `create
table if not exists` that no-ops once the table exists). Both are true at
once and are not in tension: safe to re-run without erroring is not the same
guarantee as re-run repairs drift.

### Task #14: made `0122` converge (2026-07-29)

The non-convergence above is now fixed forward, not just documented. Both
composite FKs moved out of the inline `create table` into a guarded `do $$
... if not exists ... then alter table ... add constraint ... end if; end
$$;` block, matching the pattern the file already used for the two parent
unique constraints (`product_collections_id_artist_key`,
`products_id_artist_key`) — the file was inconsistent with itself, guarded in
one place and inline three lines below it, which is the detail nobody read as
a tell the first time.

**Convergence proven, not just re-run.** On a fresh reset with the new
`0122`: both FKs present. Dropped both by hand
(`alter table ... drop constraint ...`), confirmed gone via `pg_constraint`,
then re-ran `0122` (the guarded version) against the live, already-migrated
table:

```
NOTICE:  relation "product_collection_items" already exists, skipping
CREATE TABLE
DO
CREATE INDEX
...
```

`pg_constraint` afterward: **both FKs back.** This is the same drop-then-rerun
procedure that previously exited 0 having restored nothing; it now exits 0
having actually restored the constraints, which is the difference between
"idempotent" and "convergent" this task exists to close. `pnpm test:db`:
36/36. Re-ran `0122` twice more under `-v ON_ERROR_STOP=1` for the same
re-check L6 did on the old version: exit 0 both times, FKs still present.
Full reset from zero afterward: all migrations apply clean, 36/36.

Now documented as a general pattern in `AGENTS.md` ("Footgun: a migration
that RE-RUNS without erroring has not necessarily CONVERGED"), so this class
of finding has a home for the next migration that hits it, not just a record
in this log.

### Gate A closing: named-list red run (2026-07-29)

Hardened requirement: a NAMED per-test pass/fail list, not aggregate counts —
aggregates are exactly what let the original defect slip ("18 failed | 13
skipped" cannot tell anyone WHICH tests failed). Three rounds, all with
`vitest --reporter=verbose`, against the now-fixed test files.

**Baseline.** 36/36 named and green (all three files listed individually; not
reproduced here for length, see the raw run).

**Round A: drop `product_collection_items`'s three write policies** (INSERT,
UPDATE, DELETE; SELECT left in place), targeting N1 and N2 directly. 11 of 36
failed, named:
- N1's three targets (`cannot file ANOTHER artist's product...`, `cannot file
  its own product into ANOTHER artist's collection`, `cannot claim a
  membership row by naming someone else as owner`) all failed — on their own
  new positive control, which is the correct failure mode: it proves nothing
  can write at all before the test ever reaches its ownership-specific
  assertion.
- N2's four targets all failed, each on the specific write whose error is now
  captured, exactly where N2's fix intended.
- Four collateral failures, correctly explained rather than left as noise:
  `adds a product to a collection` and `puts ONE product in TWO
  collections...` fail because they write directly; `refuses the same product
  twice` changes from `23505` to `42501` because the FIRST insert of the pair
  now fails at RLS before a second attempt can hit the unique constraint;
  `keeps membership and order across an archive/restore round trip` fails at
  its own fixture setup (it inserts 3 membership rows before ever reaching the
  archive/restore assertions) — this is NOT evidence of a droppable
  dependency on the composite FKs (there still isn't one, see the earlier red
  run), it depends on the INSERT policy purely to build its fixture, same as
  every other test that creates a row.
- Everything using the legacy-column trigger path (`mirrors a legacy...`,
  `is idempotent...`) and the three service-role tests in "cross-ownership is
  unrepresentable" stayed green, correctly: the trigger is `SECURITY DEFINER`
  and the service role bypasses RLS, so neither depends on these policies.

**Round B: restore, then drop the two composite FKs**, re-running the
original 5-unproven-test scenario against the rewritten file. Same 4 failures
as the earlier red run, same codes (`null`, `undefined`, never `23505`) —
reproducible. **N1's three tests stayed green in this round**, which is the
other half of proving they test the right thing: RLS rejects them before the
FK is ever consulted, so removing the FK changes nothing for them.

**Restore, final round: 36/36, named, all green** (listed individually in the
raw run; every test in all three files passed).

**Incident during the final round, disclosed in full.** Immediately after
`supabase db reset`, the suite failed all 36 as `AuthRetryableFetchError` —
not a test or policy problem. Traced via `docker logs supabase_kong_inklee`:
Kong (the local gateway) held a stale upstream IP for the auth container from
before the reset restarted it, and refused the connection outright
(`connect() failed (111: Connection refused)`) rather than re-resolving.
Confirmed via `curl http://127.0.0.1:54321/auth/v1/health` returning 502
directly, independent of the test framework. Fixed by restarting Kong
(`docker restart supabase_kong_inklee`), which forced it to re-resolve; health
check returned 200 and the suite passed clean on the next run. Not a
regression in anything built this session — a known class of Docker
networking issue when a dependent container restarts and the gateway does
not — but recorded because a future reset hitting the same thing should not
be mistaken for a real failure.

**Full validation, this final state:** typecheck clean, `eslint tests/db/`
clean, unit 2028/2028, `test:db` 36/36.

### Milestone 3: server behaviour — DONE (`8554e63`)

*(Written while Gate A was still outstanding; kept in the present tense of its
own moment. Gate A has since been APPROVED, and milestones 3-6 were subsequently
reviewed as a set by Gate C, which came back clean.)*

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
| Bundles | Multi-product pricing with its own stock and refund semantics. Larger than the rest of P5 combined; deliberately after collections, which it would build on. **This table listed Bundles TWICE (a second row read "Unchanged: still the largest unstarted P5 item, after P5d is genuinely complete"). The duplicate is folded in here and removed below, 2026-07-29; both rows said the same thing and neither contradicted the other.** |
| Goods sales analytics | Belongs with the P6 analytics plane rather than duplicating a second reporting path. |
| Shop customization beyond the appearance system | The shared appearance system already covers the visual layer; what remains is unspecified. |
| Variants+ beyond today's basic set | No concrete requirement recorded beyond what exists. |
| Fresh EAS build | **No longer merely batched: it is now a HARD PREREQUISITE before `goods_collections` is granted to anyone.** The two native editors (`0de2034`) are on `feat/native-goods-parity` and on this branch as its base commit, not on `origin/master`, and not on devices. On top of that, every installed build (latest is `da93749b`, built 2026-07-28 from `c00341a`) predates the `featured_collection` block type and would crash the Link Hub screen on it. See the wire hazard in `docs/web-native-parity.md`. |
| Cover image Free-vs-Plus conflict | Founder decision, logged in `plus-commercial-packages.md` §7. |

---

## Gate C: milestones 3-6 (2026-07-29) — CLEAN

Gate A and Gate B each covered one migration. Milestones 3, 4, 5 and 6 (server
behaviour, the Hub block, native management, docs) had **never been reviewed at
all** and were built while Gate A was outstanding. Gate C was opened to cover
exactly that set, and came back clean.

Artifact: `docs/product/p5d-gate-c-review.md`.

## Gate base: `0de2034` (2026-07-29) — CLEAN

`0de2034` (native discount + product-scheduling editors) is the BASE COMMIT of
`feat/p5d-collections`, so it merges to master with this branch whether or not
anyone intended it to. Founder decision 2026-07-29: **no rebase.** It was
brought into review scope instead, and reviewed clean.

Artifact: `docs/product/p5d-base-commit-review.md`.

---

## 🚨 Merge-ordering constraint. Read this before merging.

**Merging IS deploying.** Production is git-tracked from `master` and `master`
is unprotected, so a merge is a production deployment with no separate approval
step in between.

`publicCollectionsForArtist` (`apps/web/src/lib/server/collections.ts:433`) is
called from `apps/web/src/app/[slug]/page.tsx:231` and from
`apps/web/src/lib/server/hub-feature-data.ts:129`. `/[slug]` is the public
artist page: **every anonymous visitor hits this**. It queries
`product_collections.archived_at` and the `product_collection_items` table,
**neither of which exists in production until `0122` is applied**. And
`deleteCollectionCore` (`collections.ts:195`) now calls
`supabase.rpc("delete_collection_if_eligible", ...)` at `collections.ts:212-213`
— a function that **does not exist in production until `0124` is applied**. That
one is not a soft degrade: a missing RPC is `PGRST202`, which the core maps to a
failed delete for 100% of deletes.

**The migration set to apply from the branch is `0121`, `0122` and `0124`.**
Not "0121-0124".

> **Correction, 2026-07-29 (second docs pass).** `docs/roadmap.md` said "apply
> `0121`-`0124` from the branch". That range is wrong at both ends of its
> middle. `0123` **is already in production** (`add324a`) and must NOT be
> re-applied from the branch; and `0124` was UNTRACKED in git until `9bb8d0a`
> committed it this session, so a merger reading the older instruction could not
> have applied it even if they tried. Verified:
> `git ls-tree -r --name-only origin/master apps/web/supabase/migrations/ | grep 012`
> returns `0012`, `0120` and `0123` only.

**Verify by catalog read, never by the migration ledger** (standing AGENTS.md
rule, and the reason the `0001` RLS incident ran for three weeks):

```sql
-- 0122
select conname from pg_constraint where conrelid = 'product_collection_items'::regclass;
select column_name from information_schema.columns
  where table_name = 'product_collections' and column_name = 'archived_at';
-- 0121 / 0122 policies
select tablename, policyname, cmd from pg_policies
  where tablename in ('product_collections','product_collection_items');
-- 0124
select proname from pg_proc where proname = 'delete_collection_if_eligible';
```

**Do not "re-run the migration" to repair drift.** `0122` is now convergent
(fixed in `201fbfc`, see task #14 above), but that is a property of the fixed
file, not of migrations in general. Verify the specific object.

### What "fails flat" does and does not cover (task #22, PARTIAL)

The merge-before-migrate case survives on the public plane because
`publicCollectionsForArtist` degrades to the flat shop. That degrade is now
**deliberate** rather than accidental: `collections.ts:458`/`:465` and
`:476`/`:485` capture `collectionsError` / `itemsError` explicitly and
`return empty` on each. Before task
#22, both discarded the error and relied on `rawCollections ?? []` turning a
null-on-error into an empty array that happened to render identically. Same
output, no guarantee.

**Task #22 is applied to 2 of 7 reads in `collections.ts` and 0 of 3 in the
sibling files. It is NOT closed.** The unconverted ones that matter:
`listCollectionsForArtist` (`collections.ts:388`) discards the error on BOTH its
reads (`:392`, `:400`). That is the artist-facing manager, and a discarded error
there forces `productCount` to `0` for every collection, which **mis-enables the
delete button on a populated collection** on web and native. That is the exact
guarantee `canDeleteCollection` exists to provide, defeated by a swallowed
error rather than by a race.

### `0124` and the TOCTOU it does NOT close

`0124_delete_collection_atomic.sql` creates `delete_collection_if_eligible`
(SECURITY INVOKER, granted to `authenticated`, revoked from `public` and
`anon`). Its **eligibility semantics are correct** and were verified
sequentially: empty → `deleted`; populated + live → `not_eligible`; populated +
archived → `deleted`; cross-artist, even with a spoofed `p_artist_id` → `gone`,
with no bypass and no existence leak.

**The TOCTOU is OPEN.** An earlier version of the migration header and of the
caller's comment asserted "nothing can happen between eligible and gone". That
claim was never executed, it is false, and it is retracted in place in
`9bb8d0a` rather than deleted.

Reproduced three times independently on 2026-07-29 by three agents with
different fixtures. Representative run: the deleter called the RPC at
`07:30:41.175`, a concurrent writer COMMITted a membership at `07:30:45.593`,
and the RPC returned `deleted` at `07:30:45.594`, 1.1 ms later. Collection gone,
membership gone, product orphaned.

Mechanism: under READ COMMITTED a single statement evaluates its subqueries
against ONE snapshot, taken when the statement begins. The concurrent insert
takes `FOR KEY SHARE` on the parent row, so the DELETE **waits** on the lock,
but waiting does not make it re-evaluate the `not exists`. When the writer
commits, the DELETE proceeds on its stale snapshot and the composite FK's
`on delete cascade` destroys the just-committed membership. The positive control
(no concurrency) correctly returns `not_eligible`, which is why every sequential
probe passed and the suite stayed green.

The fix is to take a CONFLICTING lock on the parent first
(`perform 1 from product_collections where id = ... and artist_id = ... for update;`)
and re-check in a LATER statement, so the re-check gets a fresh snapshot. It
must ship with the two-connection reproduction as a **pre-registered regression
test, shown RED against the current version first.**

Two environment gotchas found while proving this, recorded so they are not
rediscovered:

- `set role anon` **SEGFAULTS** this local Supabase Postgres image. Use
  `has_function_privilege()` or a real anon-key client instead.
- **A PostgREST UPDATE or DELETE denied by RLS returns `{data: [], error: null}`.
  It fails SILENTLY.** `expect(error).toBeNull()` is a NO-OP for those two
  verbs. Only INSERT fails loudly, with `42501`. Any test asserting an RLS
  outcome on an UPDATE or DELETE must assert on the returned ROWS, not on
  `error`.

---

## Next intended action

**Finish P5d to a safe merge.** That is the session focus, per the founder,
2026-07-29. Both gates that would have blocked it are closed (Gate A approved,
Gate C clean, base commit `0de2034` reviewed clean).

> **Correction, 2026-07-29 (second docs pass).** This section read "Gate A
> re-review by the specialist, then a supervisor decision on merge", and listed
> `0123` as "currently queued behind the whole collections branch. Cherry-picking
> it ahead as its own change is a sequencing call". Both are resolved. The
> re-review happened and approved; the founder took the sequencing call and
> `0123` **shipped**, as `add324a`. Retracted here rather than deleted.

What actually remains before a merge is safe:

1. ~~**Apply `0121`, `0122` and `0124` to production and catalog-verify them
   BEFORE the merge.**~~ **DONE 2026-07-29**, before the merge, as required.
   See "Production application" below.
2. ~~**Task #19, the `deleteCollectionCore` TOCTOU.**~~ **CLOSED** (`4d406f9`).
   `0124` now locks the parent `for update` in its OWN earlier statement, so the
   delete's re-check runs on a fresh snapshot. Regression test
   `tests/db/collection-delete-race.test.ts`, shown RED against the
   one-statement body and green after, shipping with a control that still
   DELETES so it cannot pass by refusing everything.
3. ~~**Task #15, the DB tests.**~~ **CLOSED** (`4d406f9`). Landed as coverage of
   every `0124` RPC branch (`collection-delete-rpc.test.ts`), the concurrency
   regression, and a mock-based server-core suite in the UNIT tree
   (`src/lib/server/__tests__/collections.test.ts`), which is where test 1
   always belonged. All ten cores had zero coverage before this.
4. **Task #22, fail-flat.** PARTIALLY closed (`4d406f9`). The one with a
   user-visible consequence is fixed: `listCollectionsForArtist` discarded both
   read errors, which forced `productCount` to 0 and ENABLED THE DELETE BUTTON
   on populated collections in both managers. It now throws, deliberately the
   opposite choice from `publicCollectionsForArtist`, which must fail flat.
   Still open: the remaining reads at `collections.ts:59`, `:239`, `:247`, the
   mobile route GET, and `hub-feature-data.ts`. None of those arm a destructive
   action; they are correctness-of-reporting, not data loss.

Suite movement across this work, recorded because unchanged counts were the tell
that hid the original defect: unit **2028 -> 2114**, DB **36 -> 51**.

### Carried forward from the independent verification of the #19 fix

The fix was CONFIRMED by a read-only verifier that tried eight ways to break it,
including the two failure modes a naive race test cannot see (a fix that passes
by never deleting, and one using `for no key update`, which does not conflict
with `FOR KEY SHARE` and so looks identical while losing the same data). It also
found three things worth carrying:

1. **The safety is INHERITED, and this is the important one.** It depends on
   `0121`'s UPDATE policy (under RLS, `select ... for update` needs UPDATE, not
   just SELECT; without it the locking read matches zero rows and returns NO
   error, so no lock is taken) and on `0122`'s composite FK (which is what makes
   a child insert take `FOR KEY SHARE` at all). Dropping either one was proven
   to restore data loss with the fixed function text unchanged. **Both must be
   catalog-verified in production**, not just locally: `tests/db/` runs against
   a local stack, so equivalent drift in prod is caught by nothing. Recorded in
   `0124`'s header.
2. **Refuse path can now stall.** The lock is taken before eligibility is known,
   so a refusal waits on a concurrent membership write. Past `authenticated`'s
   8s `statement_timeout` the caller gets 57014, which `collections.ts` maps to
   the generic "Couldn't delete." instead of "archive it first". Data-safe
   (verified: both rows survive), wrong message, no test. Accepted for now and
   documented rather than fixed, because it is a message defect on a rare
   concurrent path and widening scope here is how the original defect shipped.
3. **A deadlock (40P01) is newly possible** where the one-statement version had
   none, because the body holds an exclusive row lock even on collections it
   refuses. It requires two locking statements in ONE transaction;
   `deleteCollectionCore` issues one RPC per request, so it is **unreachable
   from the app today** and becomes reachable only if something wraps this RPC
   in a larger transaction.

Deferred, with reasons recorded in the open task register at the top of this
file: **#12** (`setDiscountActiveCore` ungated, non-blocker because
`resolveDiscount` re-gates at apply time) and **#18** (the four Hub jobs swallow
every error, pre-existing house pattern).

**A fresh EAS build remains a hard prerequisite before `goods_collections` is
granted to anyone.** Installed builds predate the `featured_collection` block
type and would crash on the Link Hub screen if an artist featured a collection
on web. This cannot be fixed from the server; see the wire hazard in
`docs/web-native-parity.md`.

Still open from earlier stages, unchanged: fee schedule v2 activation and
refund policy v1 (both accountant), bundles, goods sales analytics.

---

## Production application of `0121`, `0122`, `0124` (2026-07-29)

Applied **before** the merge, which is the required order: merging is deploying,
and the branch queries `product_collection_items` at ten sites while production
did not have the table.

**Command.** `supabase db push --include-all`. The `--include-all` is not
optional here and the reason is worth keeping: `0123` had been cherry-picked
ahead and was already applied, so `0121` and `0122` sort BEFORE the last remote
migration. A plain `db push` refuses with `LegacyDbPushMissingRemoteError`. Two
dry runs first, the second confirming the exact set (`0121`, `0122`, `0124`, no
seeds, no roles).

**Lock risk, measured rather than assumed.** `0122` builds
`products_id_artist_key`, which takes ACCESS EXCLUSIVE on `products`. Production
`products` holds **7 rows** (`profiles` 19, `product_collections` 0,
`discount_codes` 0), so the build was instantaneous. Row counts after the push
were identical to before: nothing was rewritten.

**Verified by catalog read, object by object, never by re-running a migration**
(AGENTS.md footgun). All PRESENT in production: the `product_collection_items`
table; `product_collections.archived_at`; both composite FKs; both parent unique
keys (`product_collections_id_artist_key`, `products_id_artist_key`); the
`products_sync_legacy_collection` trigger; 4 policies on `product_collections`
and 4 on `product_collection_items`; `delete_collection_if_eligible` with
`prosecdef=false`, its body carrying the `for update`, and grants
`authenticated=true / anon=false`. Ledger tail: `0120,0121,0122,0123,0124`.

**Both objects the `#19` fix silently depends on were verified explicitly**,
because the catalog is where that dependency is either satisfied or not:
`0121`'s `artist updates own collections` (cmd=UPDATE) and `0122`'s
`product_collection_items_collection_fk`. Dropping either reopens the race with
the function text unchanged, and `tests/db/` cannot see production.

**PostgREST schema cache closed with LIVE calls**, because a correct catalog is
not sufficient evidence: `GET /rest/v1/product_collection_items` returned
**HTTP 200** where it had returned `PGRST205`, and the RPC returned `"gone"`
(HTTP 200) rather than `PGRST202`. The RPC probe used a random UUID that matches
no row, so it deleted nothing.

**Rollback, recorded because no down migrations exist.** Reverting the merge
would leave all of this live. Both new tables are EMPTY in production, so the
undo is safe today and gets less safe the moment an artist creates a collection:

```sql
drop function if exists delete_collection_if_eligible(uuid, uuid);
drop trigger if exists products_sync_legacy_collection on products;
drop function if exists sync_legacy_collection();
drop table if exists product_collection_items;
alter table product_collections drop column if exists archived_at;
drop policy if exists "artist inserts own collections" on product_collections;
drop policy if exists "artist updates own collections" on product_collections;
drop policy if exists "artist deletes own collections" on product_collections;
-- delete from supabase_migrations.schema_migrations where version in ('0121','0122','0124');
```

Leave `products_id_artist_key` and `product_collections_id_artist_key` in place;
they are additive unique keys and dropping them is riskier than keeping them.

**Not done, and still gating:** the merge itself, and the fresh EAS build that
must precede granting `goods_collections`.

---

## P9 appointment payments: A1, A2, and A2's independent test pass (2026-07-29)

A separate track from P5d. Nothing below is committed, nothing is pushed, and
neither migration has been applied to production.

### What is on disk

**A1 (the model and the schema).** `0125_appointment_payments.sql`;
`packages/shared/src/appointment-payments.ts` (pure: no database, no network, no
clock); `tests/db/appointment-payments-rls.test.ts`;
`src/lib/__tests__/appointment-payments.test.ts`; a table-level `revoke` mirrored
into `supabase/seed.sql`, because the seed's blanket `grant all` otherwise
clobbers the migration's revoke and `truncate` ignores RLS.

**A2 (the write path).** `0126_payment_request_send.sql` (`payment_requests.collects`,
its two check constraints, a replacement body for
`enforce_payment_request_immutability()` that adds `collects` to the frozen set,
and the `send_payment_request` RPC); `src/lib/server/appointment-payments.ts`
(create / revise / send / cancel / expire); `tests/db/payment-request-send-race.test.ts`;
the `appointment_payments` capability registration.

**A2's tests (this pass, written by a different engineer than the cores).**
`src/lib/server/__tests__/appointment-payments.test.ts`,
`tests/db/payment-request-concurrent-send.test.ts`,
`tests/db/payment-request-collects-lifecycle.test.ts`.

### Counts, measured, not carried forward from a previous note

| Suite | Before this pass | After |
| --- | --- | --- |
| unit (`pnpm test`) | 2177 in 129 files | 2277 in 130 files |
| db (`pnpm test:db`) | 125 in 7 files | 152 in 9 files |

`pnpm typecheck` clean, `pnpm lint` 0 errors (16 pre-existing warnings, none in
the new files). Both totals were re-measured after the last edit, and the db
total was read from named per-test output rather than from an aggregate.

### The part worth reading: what the new tests can actually catch

A green suite is worth nothing until something has been broken in front of it,
so every test in this pass was written against a NAMED single change that should
turn it red, and then that change was applied and the result recorded. 18 changes
to the TypeScript and 8 to the database (one object at a time, INSERT policies
never touched), each run twice: once with the new files EXCLUDED (does the
existing suite already catch this?) and once with them included. Files were
restored byte-for-byte and the catalog was re-read and compared to a baseline
after every one.

**Every one of the 18 TypeScript mutations left the pre-existing suite at
2177/2177 passed.** The cores shipped with zero tests of any kind, so that is
the expected answer rather than a surprising one; it is recorded because it is
the measurement that says the new file is load-bearing rather than decorative.
Named examples, with the red they produced:

- the entitlement gate computed and then ignored in `create` → **12 red**,
  including every "a key granted individually unlocks exactly its own core" case.
- `send` gating on an ASSUMED purpose instead of the stored `collects` → **3
  red**, one of them because the refusal arrived with the wrong plan message.
- an unknown RPC verdict treated as a successful send → **2 red**.
- `cancel` reading zero affected rows as success → **6 red**.
- `paid` added to the expirable statuses → **3 red**.
- `expired` added to them (expiry stops being idempotent) → **4 red**.
- a caller-supplied line total trusted instead of computed → **1 red**.
- `revise` cancelling the predecessor immediately → **1 red**.
- an `updatePaymentRequestCore` added to the module → **1 red**.
- `0126` renaming a verdict token without the map following → **2 red**.

**The database mutations are where the interesting result is.**

- **0125's older immutability body re-deployed** (which is exactly what
  re-running `0125` alone does, and which `0126`'s header names as its hazard):
  the entire existing db suite stayed at **125/125 passed**. `collects` silently
  leaves the frozen money-column set, every constraint, policy and index still
  reads correct, and nothing that existed before this pass notices. The three new
  tests go red, one of them naming the cause directly by reading `prosrc`.
- **Both partial unique indexes dropped**, leaving `send_payment_request`'s own
  "is another request already payable?" pre-check as the only defence. That
  pre-check is a check-then-write on a snapshot, and the split is the whole
  point: the SEQUENTIAL tests that go through it stay GREEN (including the
  existing `refuses a second payable request for the same appointment`), while
  the concurrent test goes red. Only ONE pre-existing test moves, A1's
  `refuses a second SEND against the same appointment`, which inserts an already
  committed second row and therefore measures the index rather than the race.
- **The UPDATE policy's status floor removed from USING only** (INSERT, SELECT
  and DELETE policies untouched, WITH CHECK untouched): the silent half of the
  cancel floor. A1's money-floor tests stay green because they exercise WITH
  CHECK, which is loud; what breaks is an artist cancelling a request that is
  being paid, which returns zero rows and no error and is invisible to a caller
  that only checks `error`.
- **Two mutations did NOT produce the predicted red, and both were worth more
  than the ones that did.** Removing the freeze's freshness qual
  (`and sent_at is null and status in ('draft','ready')`) from
  `send_payment_request` changed nothing at all: step 1's row lock means the
  second tab has already returned `already_sent` long before that qual is
  reached. The lock is the arbiter and the qual is the net under it, which is
  now written down rather than assumed. Removing the LOCK instead turns the
  second tab's answer into `gone` (red, and the artist is told their request
  disappeared when it was in fact already sent); removing both makes the second
  tab raise `23514` from the immutability trigger (red, refused by an exception
  rather than by an answer). Prediction, then measurement, then the correction:
  that is the only way the sequence of guards gets located correctly.

### Three things that would have produced a green proving nothing

**One of the new tests passed for the wrong reason, and the mutation run is what
said so.** The first version of the cancel-floor tests sent the status filter
that `cancelPaymentRequestCore` sends. With the UPDATE policy's USING floor
removed they all stayed GREEN: the client-side `.in(...)` alone matched no rows,
so they were pinning the core and not the database. Three tests were added that
issue the same write WITHOUT the client-side filter, which is the shape of any
future caller that forgets it, and those go red.

**A precondition in `beforeAll` made the concurrency file unable to fail the
mutation it exists for.** It asserted that the two partial unique indexes are
deployed. Dropping them threw in the hook, and vitest reported the file as
`4 skipped` rather than red: the summary line for a skipped file reads almost
like a pass. The assertion is now its own test, so the same mutation produces
two named reds, one naming the cause (`the arbiter this file measures is NOT
deployed`) and one naming the damage (`two senders racing ONE appointment must
not both end up payable … expected 2 to be 1`).

> **Correction.** An earlier version of this section attributed that `4 skipped`
> to a test file having been edited while a run was in flight. That was the
> first occurrence and it was the wrong explanation: the same result reproduced
> exactly with no edit at all, which is what identified the hook. Recorded
> rather than deleted, because "it was a fluke of my own making" is precisely
> the conclusion that would have left the hole in place.

**`pg_blocking_pids` chains, so "backends blocked by the holder" is the wrong
overlap measurement for two senders on ONE row.** The first version of the
concurrent test asserted that the lock holder was blocking two backends. It went
red on a run whose verdicts were plainly correct. Probed directly rather than
reasoned about: with a holder on pid 2685, the first waiter reports
`blockers [2685]` and the second reports `blockers [2688]`, the FIRST WAITER.
Two backends waiting for the same row queue on a tuple lock, so the original
holder does not appear in the second one's list at all. Lowering the threshold to
1 would have made it pass while no longer measuring anything; counting PARKED
SENDERS instead is chain-shaped and answers the question that was being asked.

### Findings for whoever owns A2 next

1. **"Every core refuses a Free artist" is FALSE by design, for two of the five.**
   `cancel` and `expire` refuse nobody, deliberately: stopping a live request for
   money must keep working for an artist who has lapsed to Free and while the
   whole capability is paused, and expiry runs unattended. That is the right
   call and it is now asserted from BOTH sides (the three money-asking cores
   refuse; the two stopping cores do not even read the plan). It is called out
   here because "cancel has no gate" and "cancel forgot its gate" look identical
   in a diff. Also recorded in `docs/web-native-parity.md`, since a mobile route
   adding its own check around cancel would break it on native only.
2. **A1's `refuses a second SEND against the same appointment` carries a
   concurrency claim that its own body cannot support** ("two sends racing cannot
   both win"). It inserts a second row after the first has committed. The claim
   is now backed behaviourally by `payment-request-concurrent-send.test.ts`,
   which parks two real sends on one lock, proves they were in flight together,
   and asserts that exactly one ends up payable, that the loser is refused for a
   same-appointment reason, and that the loser is still sendable afterwards. The
   control that a "refuse everything under contention" fix cannot pass: two sends
   on two DIFFERENT appointments, same parking, both must succeed. Measured
   red with the arbiter dropped: `#1="sent" #2="sent" parked=2
   blockedByHolder=2 payable=[two ids]`, and the control stayed green in the
   same run.
3. **The module's exported surface is pinned.** "There is no code path that edits
   a sent request" is a claim about something that does not exist, and the only
   way to keep it true is to make adding one fail a test.
4. **Still open, unchanged from A2's own handoff:** `appointment_payments` is not
   in production `DISABLED_CAPABILITIES`; `isCapabilityDisabled` is fail-open, so
   what keeps P9 dark is that nothing calls these cores and all seven entitlement
   keys are Plus-only. Park the name before A3 wires Stripe.
5. **Not covered here, and it is A3's:** nothing checks a request total against
   the outstanding balance. `outstandingBalance` and `checkCollectable` exist in
   the shared module and no core calls them, so today an artist can compose and
   send a request for more than is owed. That is a deliberate slice boundary, not
   an oversight, but it is a real hole until A3 lands.
6. **Both migrations are unapplied to production**, in order, catalog-verified,
   per the P5d lesson. `0125` takes ACCESS EXCLUSIVE on `booking_requests` and
   `projects` while its composite unique keys build.

---

## P9 slice A3 (quote + intent): NOT BUILT. The fee gate that precedes it IS (2026-07-30)

**Status, stated plainly so nothing downstream reads this as progress on A3.**
A3 does not exist. `master` is at `7d6773b`, the working tree was clean when
this pass started, there is no quote module, no PaymentIntent path for a payment
request, no idempotency key, and nothing calls `outstandingBalance` or
`checkCollectable` from a server core. The A2 handoff's finding 5 ("nothing
checks a request total against the outstanding balance") is unchanged and still
open.

What this pass produced is the ONE piece of A3's test obligation that had to be
written BEFORE the code, and that becomes worthless the moment it is written
after: the characterization of the live fee numbers.

### Why it had to come first

A3's headline risk is not a new feature, it is a refactor of a live money path.
Two sources compute the appointment fee for the same PaymentIntent:

| path | source | rate |
| --- | --- | --- |
| intent creation | `bookings.ts:853`, `platformFeeCents` | hardcoded 300 bps, no tier, no version |
| basket re-prepare | `request/[token]/actions.ts:394,504`, `resolveOrderFee` to `computeOrderFees` | the schedule's appointment rate for the artist's tier |

Under v1 the schedule also says 300 bps for both tiers, so the two agree on
every live number and the divergence is invisible. Under v2 the schedule says 50
bps for Plus and null ("cannot transact this lane") for Free while the hardcode
still says 300, which is the 600 vs 100 vs 0 that
`plus-remaining-work-plan.md` Stage 4 refuses to flip into.

A test written after the unification pins whatever the unification produced,
decided by the same person who wrote it. These literals were taken from the code
charging real artists today, so a unified path is measured against something it
cannot edit into agreeing with itself.

### What is on disk

`apps/web/src/lib/server/__tests__/appointment-fee-unification.test.ts`, 14
tests, no production code changed.

- **The golden table.** 21 amounts, expected `application_fee_amount` as
  LITERALS, never re-derived from the formula under test. Chosen for where
  rounding bites, not for round numbers: 1 and 16 minor units where the fee
  rounds down to zero, 17 where it first rounds up, 50 / 150 / 250 which are
  exact `.5` ties (`Math.round` goes half away from zero, so 2 / 5 / 8, and a
  refactor reaching for `Math.floor` or `toFixed` moves all three), 5017, and
  10000000 which is `MAX_DEPOSIT_AMOUNT`.
- **A contiguous sweep, 1 to 3000 minor units, both tiers.** At 3% every
  hundredth amount is a tie, so a sampled table can miss all of them.
- **The rate identity.** `PLATFORM_FEE_BPS` equals `FEE_SCHEDULE_V1`'s
  appointment rate for free and for plus. One number in two files, asserted,
  rather than two that happen to agree.
- **The real entry points, not only the primitives.** `resolveOrderFee` is
  driven with the same mock shape as `order-fee-sync.test.ts` and must land on
  the deposit path's number at every golden amount and on both tiers.
- **Sponsorship on both paths.** Zero on the intent, and
  `appointmentFeeBeforeSponsorshipMinor` still equal to the full fee, because a
  unified path that waived by lowering the RATE would produce the same 0 on the
  intent and a wrong number in the field the waiver is reported from.
- **Block 4, parameterized over v1 AND v2.** 4a asserts agreement under v1. 4b
  asserts the divergence is STILL PRESENT under v2, at 19 of the 21 amounts (the
  two that agree do so because both rates round them to zero).

### 4b is a pre-registered falsification and is EXPECTED to go red

That is its job. It cannot pass by accident and cannot be satisfied by a partial
unification: any amount that starts agreeing shrinks the list. When A3 lands the
fix is three lines, written into the test file itself: delete the 4b block, add
v2 to 4a so agreement is asserted under BOTH versions, and leave the golden
table exactly as it is. Deleting 4b without adding v2 to 4a leaves the Stage 4
flip unguarded, which is the state this file exists to end.

### Method: every test was killed before it was believed

Eight single-change mutations, each with its target named in advance, applied one
at a time, run with `--reporter=verbose` and read as named per-test output rather
than as an aggregate, then restored from git and re-verified.

| mutation | predicted casualties | observed |
| --- | --- | --- |
| M1 `PLATFORM_FEE_BPS` 300 to 299 | golden, rate identity, sweep, 4a x2, 4b x2 | 7 red, as predicted |
| M2 `platformFeeCents` round to floor | golden, sweep, 4a x2, 4b x2 | 6 red |
| M3 v1 `appointmentPayment.plus` 300 to 250 | schedule-side golden, rate identity, sweep, sponsorship, `resolveOrderFee`, 4a plus | 6 red |
| M4 v2 `appointmentPayment.plus` 50 to 300 | 4b plus, "no version and no tier" | 2 red |
| M5 `computeOrderFees` ignores sponsorship | sponsored-on-both-paths, re-prepare waiver | 2 red |
| M6 v2 `appointmentPayment.free` null to 300 | 4b free | 1 red |
| M7 `ACTIVE_FEE_SCHEDULE_VERSION` v1 to v2 | active-version pin, `resolveOrderFee` | 2 red |
| M8 `platformFeeCents` loses its non-positive guard | non-positive refusal | 1 red |

**Every one of the 14 tests was killed by at least one mutation.** That is the
measurement that matters, and it is the one the RLS pass of 2026-07-29 found
missing when 8 tests in a suite turned out to be incapable of failing.

### Counts, measured before and after

| Suite | Before | After |
| --- | --- | --- |
| unit (`pnpm test`) | 2303 in 130 files | 2317 in 131 files |
| db (`pnpm test:db`) | 183 | NOT re-measured |

The db figure is deliberately not carried forward as a result. This pass changed
no SQL, no seed and no file under `tests/db/`, so there was nothing for it to
measure; writing 183 in the "after" column would be a number nobody ran.

No production file was modified by this pass; `git status` after the mutation
run listed only the new untracked test file.

### What A3 still owes, none of it started

Six of the eight obligations this pass was scoped to cover need code that does
not exist and could not be tested against a stub without the test becoming a
test of the stub:

1. Over-collection refused at the new server entry point. `checkCollectable` is
   proven pure; nothing calls it.
2. The displayed amount and the charged amount from ONE quote. There is no
   quote object to share.
3. Idempotency of a logical collection, and a legitimate second collection not
   being blocked. No Stripe call exists to key.
4. Illegal lifecycle transitions refused now that the table is wired. The table
   is pinned at model level; the wiring is A3's.
5. A Free artist refused at every NEW entry point, called directly rather than
   through the UI. The A2 cores are covered; A3 adds entry points.
6. Payment against an obsolete revision, and concurrent attempts, at the intent
   layer. `payment-request-concurrent-send.test.ts` covers the send layer only.

Spec section 12 obligations reachable at A3 therefore remain unclaimed. The
architecture doc's section 7 debt from A1 is closed in the same change as this
note: `payment_collections` is now documented there.

---

## Carried to A8: a Free artist can still create a live Connect account (2026-07-30)

Recorded here because A3's intent-core review asked for it by name and this file
did not carry it. The plan file already does (`plus-remaining-work-plan.md`, row
A8: "Never for a Free artist, who today can create a live Connect account they
can never use"); this is the same item, restated with its call site.

**Spec section 1 says never.** "The Stripe connected account is created or
activated only inside the Plus payment-onboarding flow, so an artist who never
upgrades never costs a Connect account."

**What is true today.** `ensureConnectAccount`'s only caller is
`apps/web/src/app/(artist)/settings/payouts/actions.ts:78`. That action gates on
authentication and a rate limit and on NO entitlement, so a Free artist can
complete Custom Connect onboarding for an account they can never collect
through.

**A3 neither widens nor narrows it.** `appointment-payment-intent.ts` calls
`getConnectRoutingForArtist`, which only READS `profiles`, and does not import
`ensureConnectAccount`. Held by
`appointment-payment-collection.test.ts`, "reads Connect routing and never
creates an account".

**Why it is not fixed here.** An entitlement check bolted onto that action would
lock out the artists who already have accounts and would still leave the Plus
payment-onboarding flow unbuilt. Both halves belong to A8 and have to move
together.

---

## C5 — Shop + guest-spot surface controls (2026-08-01, ready for review)

Task #38 (M2), founder ruling 19. Decisions S2-S6 recorded in
`plus-build-time-decisions.md`. Three independent, additive visibility
controls, all FREE (no new entitlement, S5):

1. **`hidden: ["shop"]` finally gets a writer.** It was readable everywhere
   (the public page, the parser) but nothing wrote it. New toggle on
   `/bookings/settings` (`saveShopVisibilityAction`, same read-merge-write
   shape as the booking-policy toggle) + sibling mobile route
   `GET/POST /api/mobile/settings/shop-visibility`.
2. **`settings.features.shop_checkout`**, a new key alongside `goods_module` /
   `checkout_addons` (`shopCheckoutEnabled()` in `lib/features.ts`). Toggle on
   `/goods` + sibling mobile route `GET/POST /api/mobile/goods/settings`.
   Enforced at THREE points: the standalone checkout page (`notFound()`), the
   public action (`startShopCheckoutAction`), and — the one that actually
   matters — the money-path core (`createStandaloneGoodsCheckoutCore`), which
   now reads the artist's profile settings server-side and fails CLOSED on a
   genuine read error (money rule), open (default-on) on a merely
   missing/empty settings row.
3. **`trips.is_public_visible`** (migration `0137`), backfilled from
   `show_on_booking_form` in the SAME migration (a guarded, convergent
   column-add: re-running after the column exists skips both the add and the
   backfill, so it cannot clobber an artist's later independent choice). The
   Hub's guest-spots block previously reused `show_on_booking_form`; now
   independent. Web (`travel/trip-manager.tsx`, both modals) and native
   (`apps/mobile/.../trips/[id].tsx`, both screens) both gained the second
   "Show on your Hub" switch. The native mobile-wire field is TRI-STATE
   (`isPublicVisible?: boolean`) unlike `showOnBookingForm`, specifically so an
   old app build cannot silently reset the new flag to `true` on every save.
4. **`hub-feature-data.ts`'s "goods" block** additionally gates on
   `isModuleVisible(bioPage, "shop")` (S4): it deep-links to the booking-page
   shop teaser, so hiding that teaser now also hides the block rather than
   leaving a broken link on the Hub.
5. **Standalone-shop theming (S6):** `/[slug]/shop/checkout` now resolves
   `surfaceAppearance(artistId, settings, "shop")`, applying the artist's
   accent/font/button-radius the same way the booking page does, clamped to
   `data-appearance="light"` (no dark CSS block exists for this page's
   markup, same clamp the booking page and large-project page already use).

**Deviation from the brief, with reasoning:** the brief assumed an existing
"goods_module switch" the new `shop_checkout` toggle could sit beside. No such
artist-facing editor exists anywhere (web or mobile) — `goods_module` and
`checkout_addons` are both settings-only flags with no UI, confirmed by
repo-wide search. The new toggle was placed on `/goods` (the natural home for
shop-related artist controls) instead, always visible regardless of the dark
`GOODS_COMMERCE_ENABLED` park switch — matching the precedent already set by
`/goods/bundles` and `/goods/discounts`, which show their management UI
whether or not the money path is live.

**Also flagged, not fixed (out of scope for this slice):** `apps/web/src/db/
schema.ts` is a Drizzle reference file for the `trips` table that is ALREADY
stale before this change (missing `icon_color`/`icon_bg` from earlier
migrations), so it is evidently not a maintained sync target; `is_public_
visible` was not added there to avoid extending an already-drifted, seemingly
unused artifact under an unrelated change.

Tests added: `features.test.ts` (`shopCheckoutEnabled`), `mobile-travel.test.ts`
(tri-state `isPublicVisible`), `goods-checkout.test.ts` (four new cases: off /
goods-module-off / read-error-fails-closed / default-on), `shop/checkout/
__tests__/actions.test.ts` (one new refusal case), a new `hub-feature-data.
test.ts` (goods-block S4 gate + guest_spots column), a new `bookings/settings/
__tests__/actions.test.ts` (shop-visibility round-trip), and a new `goods/
__tests__/shop-checkout-toggle-action.test.ts`. Migration `0137` is repo-only;
no local Docker Postgres in this environment, so its SQL is unverified against
a real database — recorded as CI-pending, not faked. `docs/web-native-parity.md`
updated in the same commit (new Update log entry, dated 2026-08-01).

Not built in this slice (no brief item covered them, flagged rather than
silently dropped): dedicated unit tests for `travel/actions.ts`'s new
`is_public_visible` read/write (covered only by typecheck + the existing
suite's regression net, not new named tests); a parity table ROW (the doc's
narrative Update log entries are the established pattern for slices at this
size, matching several immediately-preceding 2026-07-31/08-01 entries that also
have no corresponding table row).

---

**2026-08-01 — FD build slice 1: FD1 (`rich_content_blocks` split) + FD3/FD13
(marketing wording) + FD11 (v2 legacy-rate verification).** Founder rulings
FD1-FD13 (full text `plus-build-time-decisions.md`, FD rulings section;
board `plus-consolidated-review-handoff.md` §1a) are FINAL; this slice covers
the four items the board marks against slice 1.

**FD1 (mint `rich_content_blocks`, move `image_gallery` off `appearance_custom`,
no split gating may remain).** Added `rich_content_blocks` to
`ENTITLEMENT_FEATURES` (`packages/shared/src/entitlements.ts`), to
`CAPABILITIES` (`packages/shared/src/app-config.ts`, additive mobile-config
wire) and its lockstep test, to admin `FEATURE_LABELS`
(`account-entitlements.tsx`), and to the capability registry
(`docs/architecture/capability-registry.md` + `plus-capability-registry.ts`,
new row + a corrected `appearance_custom` row scoped to styling only). Added
the GRANT gate `richContentBlocksAllowed` (`entitlement-gates.ts`) and
re-pointed every gallery gate onto it: the hub RENDER
(`app/[slug]/hub/page.tsx`), BOTH save paths (`saveBioPageAction` +
`uploadGalleryImageAction` in `link-hub/actions.ts`; `POST /api/mobile/
settings/hub`), and both editor render gates (`link-hub/page.tsx`'s
`richBlocksAllowed`, the mobile GET in the same route). Verified (not
assumed) that no grant migration is needed: `computeLegacyFreeV1Grant`
(`entitlements.ts`) only ever sets `{ features: { custom_templates: true },
limits: {...} }`, so the legacy_free_v1 cohort never held the gallery
capability under the old `appearance_custom` gate either — splitting the key
changes nothing for existing grants. Grep proof (zero gallery-related
`appearance_custom` call sites remain): `grep -rn "appearance_custom"
apps/web/src apps/mobile` returns only the legitimate styling gate
(`appearanceCustomAllowed`, its tests, the lockstep list, the admin label)
and historical/explanatory comments noting the FD1 supersession — no live
gallery gating. Native fail-safe verified by reading, not rebuilt: the
guarded lookups from D5 (`BIO_BLOCK_META[type]?.addLabel ?? type` etc. in
`apps/mobile/app/settings/link-hub.tsx`) mean an older client hitting the
(unchanged) `image_gallery` block type stays safe regardless of which
entitlement key gates it — FD1 changed the gate's NAME, not the wire shape,
so this stays additive.

**FD3 + FD13 (approved marketing wording).** `PLUS_BENEFITS`
(`packages/shared/src/plus-benefits.ts`) restored the two claims removed
2026-07-28, using FD13's exact FINAL wording: "Collect deposits and full
appointment payments" (replacing the narrower "Collect card deposits
in-app") and "Customise your booking page with templates, galleries and
flexible sections" (new entry). Both were release-state-verified against
the capability registry BEFORE adding, per FD13's condition: appointment
payments are fully built (A1-A8, migrations 0125-0128, registry row
"ready") and booking-page templates are fully built (`form_custom`,
registry row "ready"); galleries are the `rich_content_blocks` capability
minted in this same slice. Registry `pricingPageClaim` fields updated on
the affected rows ("Appointment payment requests", "Booking-form
customization", the new `rich_content_blocks` row) with the verification
note. FD3's "Flexible section layouts and page templates" phrasing is
recorded as approved-but-not-yet-publishable on the `appearance_custom`
row (that capability is still "build" readiness — 5 more surfaces + both
editors remain, P1b) — not published anywhere yet, per FD13's release-state
condition. Forbidden-phrasing sweep (`grep -riE "fully customisable|fully
customizable|page.?builder|drag.and.drop"` across `apps/` and
`packages/shared/src`) found zero live occurrences in any user-facing
string; the only hits were historical code comments narrating a past
correction, which were left as accurate history and only annotated with the
FD13 update.

**FD11 (verify v2 legacy rates, change nothing that already holds).**
Confirmed by reading + a new test, not rebuilt. The chain already existed
split across two files: `entitlements.test.ts` proved a grandfathered Free
artist resolves to the `"legacy"` tier (not `"plus"`); `fee-schedule-
legacy.test.ts` proved `"legacy"` prices at 300bps under v2 (not the Plus
50bps). Added one explicit test at the `appointmentTierFromOverrides` level
per the brief (`entitlements.test.ts`, "FD11: a grandfathered artist without
Plus does not get Plus pricing") that walks the full composition in one
assertion: `card_deposit_collection` grant + free `planTier` →
`"legacy"` → `laneRateBps(..., FEE_SCHEDULE_V2.version)` = 300, explicitly
`!== ` the Plus rate. Per-transaction fee-tier stamps confirmed to exist by
reading migration `0136_fee_tier_stamp.sql` (`fee_tier` column + a named
CHECK constraint on `booking_requests`, `orders`, `payment_collections`,
values constrained to `'free' | 'plus' | 'legacy'`, added via the convergent
guarded-`do $$` pattern) and by grepping the four write sites that actually
stamp it: `bookings.ts:943`, `appointment-payment-intent.ts:689`,
`appointment-payment-settlement.ts:189`, `goods-checkout.ts:473`.

**Validation.** `npx tsc --noEmit` (web) clean; `npx tsc --noEmit` (mobile)
clean; `eslint` on every touched file: 0 errors (1 pre-existing unrelated
warning, `entitlement-gates.test.ts:5` `_c` unused, present before this
slice); full `npx vitest run` (web): 164 files, 2831 passed + 1 expected
fail (2832 total) — up from the 2823-passed/1-expected-fail baseline by
exactly the 8 tests this slice added (5 in the `richContentBlocksAllowed`
GRANT-gate table + 2 in a dedicated grandfather-does-not-imply describe
block + 1 FD11 test), zero regressions.

Docs updated in the same change: `docs/architecture/capability-registry.md`
(new `rich_content_blocks` row), `docs/web-native-parity.md` (correction
note on the existing `image_gallery` parity entry), `docs/product/account-
and-entitlement-system.md` (20 feature keys, 11 gates, new gate row, current
test count), `docs/product/plus-build-time-decisions.md` (implementation
note under the FD rulings section).

---

**2026-08-01 — FD4: gallery "Import from URL" (SUPERSEDES GB2).** Founder
ruling FD4 (board item, `plus-consolidated-review-handoff.md` §1a): "the
permanent raw URL field is removed... download SERVER-SIDE through the
existing upload pipeline, stores in Inklee storage." Same slice as the FD1
build above extends into.

**What shipped.** `link-hub/bio-page-form.tsx`'s per-image editable url
`<input>` is REMOVED, replaced by a read-only thumbnail preview and an
"Import from URL" control next to "Upload image". New
`importGalleryImageFromUrlAction` (`link-hub/actions.ts`) downloads the
artist-supplied URL server-side and stores it through the SAME
`processAndUpload` pipeline as a direct upload — refactored the shared tail
(`requireGalleryEntitlement`, `galleryAtCapacity`,
`uploadProcessedGalleryFile`) so both actions enforce the identical
entitlement-first / ceiling-before-network-work ordering rather than
diverging over time.

**New SSRF guard** (`apps/web/src/lib/server/ssrf-guard.ts`): resolves the
target hostname via DNS and refuses to fetch if it (or an IP-literal itself)
is loopback, RFC1918-private, link-local (including the 169.254.169.254
cloud-metadata address every cloud provider uses), CGNAT, documentation, or
multicast/reserved — fails closed on a lookup error or an unparseable
address. This is a DIFFERENT shape of guard than the pre-existing
`downloadInstagramThumbnail` (`instagram-storage.ts`), which trusts a FIXED
host-suffix allowlist (Instagram/Facebook's own CDN): the whole point of
gallery import is fetching a host nobody pre-approved, so there is no
allowlist to lean on, and the address-validation step is the actual defense.
`redirect:"error"` on the outbound `fetch()` (`gallery-url-import.ts`) closes
the redirect-based bypass completely (no second hop to re-validate). The
declared `Content-Length` is treated as an early, cheap rejection only; the
actual response body is read via a streaming reader that counts bytes as
they arrive and aborts (cancelling the stream) the moment the running total
crosses the 4MB cap, so the cap holds even against a server that sends an
unbounded body with no, or a false, Content-Length. A 20/artist/hour rate
limit (`checkGalleryImportRateLimit`, `lib/ratelimit.ts`) sits before the
ceiling check and the fetch, since this action spends Inklee's own egress on
an otherwise-arbitrary host, unlike a direct upload.

**Parser tightened to match** (`packages/shared/src/bio-page.ts`): a new
`sanitizeHostedGalleryImageUrl` requires a `supabase.co` host under the
`logos` bucket's public-object marker (`HOSTED_LOGOS_PUBLIC_MARKER`, also
now the ONE source `hub-images.ts`'s orphan-cleanup path imports, closing a
second local copy of the same literal that could have drifted). A gallery
image whose url is not Inklee-hosted is dropped at the parser, not merely
hidden by the editor UI — so a hand-crafted save payload naming an external
URL is refused at the data layer. Safe to enforce strictly retroactively:
re-verified (same check as FD1) that `computeLegacyFreeV1Grant` never
granted the gallery capability, so no external-URL gallery data exists
anywhere to break.

**Scope boundary.** Web-only, matching D4's pre-existing web-only-editing-v1
posture: the native editor is untouched (still a read-only summary) and does
not gain an import affordance in this slice. Native gallery editing
(including import) is FD2, a separate already-queued build item (#48).

**Residual risk, recorded not hidden** (`docs/audit/findings.yaml`): the
SSRF guard validates the resolved address BEFORE the request, not the
address `fetch()` itself connects to. A DNS-rebinding attacker who controls
a domain's records could in principle serve a public address to the check
and a private one moments later to the real connection; fully closing that
needs resolving to one address and connecting to it directly (bypassing the
independent DNS lookup inside `fetch`), a larger change than this slice. The
same gap exists, MORE exposed, in the pre-existing
`downloadInstagramThumbnail`, which runs unattended in background sync
rather than from one explicit artist action, and has no address-validation
step at all today.

**Validation.** `npx tsc --noEmit` clean (web + mobile); `eslint` 0 errors
on every touched file. New/updated test files: `ssrf-guard.test.ts` (12
tests: IPv4/IPv6 private-range detection incl. cloud metadata and the
IPv4-mapped-IPv6 unwrap, the DNS-rebinding-shaped "any address private"
case, fail-closed on lookup error/empty result), `gallery-url-import.test.ts`
(12 tests: scheme/format validation, the SSRF refusal, content-type
allowlist incl. a charset parameter, the declared-length short-circuit, the
mid-stream abort with an assertion the stream was actually cancelled, empty
body, missing body), `upload-gallery-image.test.ts` (extended: entitlement-
first, rate-limit refusal, ceiling, guard-failure passthrough, not-signed-in,
all before-the-network-work ordering), `bio-page-settings.test.ts` (extended:
the parser drops a non-hosted https url end-to-end, plus a dedicated
`sanitizeHostedGalleryImageUrl` describe block incl. the anchored-suffix
check against a `notsupabase.co`-style near-miss host). Full `npx vitest run`:
166 files, 2868 passed + 1 expected fail (2869 total) — up from the
2831-passed/1-expected-fail baseline (FD1 commit `02c8b814`) by exactly the
37 tests this slice added (12 `ssrf-guard.test.ts` + 12 `gallery-url-
import.test.ts`, both new files, + 6 `bio-page-settings.test.ts` + 7
`upload-gallery-image.test.ts`), zero regressions. `pnpm audit:validate` /
`pnpm audit:generate` both clean; new findings `HUB-GAL-002` (the SSRF
guard's DNS-rebinding residual risk, self-flagged) and `HUB-GAL-003` (an
earlier draft's byte cap buffered the whole response via `res.arrayBuffer()`
before checking length; found and fixed in the same slice, mutation-proven
via a streaming running-total abort) plus coverage rows.

---

**2026-08-01 — FD7 (visibility summary) + FD8 (goods Hub block destination,
SUPERSEDES S4).** Founder rulings (`plus-build-time-decisions.md`, FD rulings
section): FD7 "CONFIRMS S2 and adds required UX: a clear per-surface
visibility summary"; FD8 "the hub goods block gets an EXPLICIT destination
setting... SUPERSEDES S4."

**FD8 — what shipped.** The `goods` feature block (`packages/shared/src/
bio-page.ts`) gained a `destination: "standalone_shop" | "booking_page"`
field — the first field any feature block has ever carried (every other one
is still pure presence-and-position). The block type carved into its own
`BioGoodsBlock` shape; `isFeatureBlock` no longer narrows to it (a real
behaviour change, pinned by a test), `isGoodsBlock` narrows it separately.
The web editor (`link-hub/bio-page-form.tsx`) and the native editor
(`apps/mobile/app/settings/link-hub.tsx`) both gained a destination picker
(a `<select>` on web, `FilterChip`s on native) that warns, rather than
blocks, when the artist's saved selection is currently unreachable — the
selection is preserved either way, never silently swapped for the other
destination. Public render (`hub-feature-data.ts`) resolves visibility +
href server-side into one `{ visible, href }` shape consumed by a new
`HubGoodsBlock` component, so the destination-vs-availability decision lives
in a file this project's vitest actually covers (`src/**/*.test.ts` does not
run `.tsx`), not in JSX.

**The missing-destination judgement call (asked for explicitly).** A goods
block with no `destination` key at all resolves to `"booking_page"`, NOT the
ruling's plain `"standalone_shop"` default for new configs. Reasoning: every
goods block in production today has always deep-linked to the booking page
(pre-FD8 S4 behaviour), and the standalone shop is separately dark
(`GOODS_COMMERCE_ENABLED` off) while the artist's `shop_checkout` toggle
defaults ON — so defaulting a missing key to `"standalone_shop"` would, on
deploy day alone with no re-save and no client update, silently turn every
existing artist's working Hub shop link into a link to a page that 404s.
There is no version marker on stored `bio_page` JSON to distinguish
"genuinely new" from "existing, never touched since this shipped" — a
missing key looks identical either way — so `parseGoodsDestination`
(bio-page.ts) picks the one outcome that cannot regress a live page. An
EXPLICIT but unrecognised value (something wrote a value and got it wrong)
still falls back to the ruling's stated default, `"standalone_shop"`. Full
reasoning is in the function's own comment, since that is where a later
reader will look.

**Wire safety, separate from the above.** An old app build that predates
this field re-submits a goods block as a bare `{id,type:"goods"}` on ANY
unrelated save (reordering a link, editing a headline) — identical to a
genuinely untouched legacy row, which the parser default above handles. What
the parser CANNOT handle is an artist who already chose `"standalone_shop"`
through an entitled client having that choice silently reverted to
`"booking_page"` by that old-client resave. `preserveGoodsDestinationOnSave`
(bio-page.ts) fixes this as a second pass, mirroring `gateMediaBlocksForSave`'s
shape: compare the incoming RAW payload (did it carry the key at all) against
the CURRENT stored settings, and if the key was omitted, keep whatever was
already stored. Wired into both save paths (`link-hub/actions.ts` and
`POST /api/mobile/settings/hub`) in the same place `gateMediaBlocksForSave`
already runs. The mobile GET route also gained an ADDITIVE `goodsAvailability`
key so the native picker can warn; an older build ignores it.

**FD7 — what shipped.** A visibility summary at `/goods`
(`goods-visibility-summary-card.tsx`), fed by a pure derivation function
(`goods-visibility-summary.ts`) so the state logic is covered by vitest
independent of the copy. Reports, in one place with a link to each control:
the booking-page shop teaser (`hidden:["shop"]` + `canUseGoods`), the
standalone shop (the artist's `shop_checkout` toggle, the platform-wide
`GOODS_COMMERCE_ENABLED` dark flag reported PLAINLY as not the artist's
fault, and Stripe Connect charge-readiness via `deriveConnectRouting`), and
the Hub block (present, its destination, and whether that destination is
currently reachable) — plus an explicit "not published anywhere" state when
none of the three would show a visitor anything. `goods-visibility.ts`'s
`goodsDestinationAvailability` is the ONE place both FD7's summary, FD8's
render gate, and FD8's editor warning read the two availability ANDs from,
so they cannot drift apart.

**A gap noticed, not fixed — flagged for the register.** FD8's own
availability formula for the Hub block ("standalone_shop is available when
shopCheckoutEnabled AND goods_module is on") is deliberately narrower than
what actually makes the standalone shop page functional: it does not include
`GOODS_COMMERCE_ENABLED` (the platform dark flag) or Stripe Connect
readiness, both of which the FD7 summary DOES report, separately, under
`standaloneShop`. This is not an oversight in this slice — it matches the
ruling's literal formula — but the practical consequence is real: while
`GOODS_COMMERCE_ENABLED` stays off (the current state), a NEWLY added goods
block defaults to `"standalone_shop"` (FD8's stated default for new blocks)
and reads as "available" to both the render gate and the editor (no
warning), yet its target page 404s for every visitor
(`shop/checkout/page.tsx`: `if (!isGoodsCommerceEnabled()) notFound()`).
`deriveGoodsVisibilitySummary`'s `publishedNowhere` inherits the same gap: it
can read `false` (something IS "published") purely because of an
available-per-formula Hub block pointing at a destination that would 404.
Proven in `goods-visibility-summary.test.ts` ("false when only an AVAILABLE
hub block is present, everything else hidden" — the test asserts today's
actual behaviour and documents the tension in a comment rather than
asserting around it). Not fixed in this slice because the ruling's formula
is explicit and narrower gating would be a scope decision, not a bug fix;
recording it here since the supervisor owns `docs/audit/findings.yaml` for
this task.

**Records.** `docs/web-native-parity.md`: new table row ("Goods Hub block
destination") + a narrative entry marking the prior S4 entry superseded.
Decision-log implementation note under the FD rulings section in
`plus-build-time-decisions.md`.

**Validation.** `npx tsc --noEmit` clean (web + mobile), `pnpm --filter
@inklee/mobile typecheck` clean (incl. the lucide-icon check), `eslint` 0
errors on every touched file (one pre-existing-pattern warning fixed inline:
an unused `tpl` prop on the new `HubGoodsBlock`, removed rather than
suppressed). Full `npx vitest run`: 168 files, 2910 passed + 1 expected fail
(2911 total) — up from the 2876-passed/1-expected-fail baseline (commit
`6bac9914`) by exactly the 34 tests this slice added: 9 in
`bio-page-settings.test.ts` (5 destination-parsing + 4
`preserveGoodsDestinationOnSave`), 7 in new `goods-visibility.test.ts`, 14 in
new `goods-visibility-summary.test.ts`, and a net +4 in
`hub-feature-data.test.ts` (3 pre-existing S4 tests updated to carry an
explicit `destination` and extended with `result.goods` assertions, plus 4
new: standalone-shop-toggle-off, standalone-available-with-teaser-hidden,
empty-shop-still-hidden, never-re-routes). Zero regressions.

---

**2026-08-01 — FD6: variant-aware bundles (FINAL ruling, SUPERSEDES GC7).**
Founder ruling FD6 (`plus-build-time-decisions.md`, FD rulings section):
"Bundle components carry product + variant + quantity; checkout validates
existence/ownership/availability/stock/currency/price; historical orders
preserve the purchased variant composition; refund/restock/reconciliation
cover variant-bearing bundles." Baseline for this slice: `f043763f`, 2967
passed + 1 expected fail.

**What shipped, migration.** `0138_bundle_item_variants.sql`:
`product_bundle_items.variant_id` (nullable = "no variant needed", valid only
while the product has no ACTIVE variant to choose) and
`order_item_bundle_components.variant_id` + `variant_snapshot` (the sale-time
record). The OLD `unique (bundle_id, product_id)` is replaced by TWO
constraints rather than one straight 3-column swap, because Postgres treats
NULL as distinct from every other NULL: a real `unique (bundle_id, product_id,
variant_id)` constraint for the non-null case (two rows collide only when
their variant_id values are equal AND non-null — "same product, same variant,
twice"), plus a PARTIAL unique INDEX on `(bundle_id, product_id) where
variant_id is null` for the null case, since a plain UNIQUE constraint cannot
carry a WHERE clause. Without the second half, the same product could be
added twice to a bundle with no variant chosen for either — exactly the
common case, since a product with no active variants always carries
`variant_id` null.

**The composite-FK decision, and why it was rejected.** `variant_id` is a
SIMPLE (non-composite) FK to `product_variants(id)`, not a composite FK to
`(id, product_id)`. A composite FK's `ON DELETE SET NULL` nulls EVERY column
of that FK at once (pre-PG15; PG15+ can scope it to named columns, but that is
a needless version dependency here), so it would null `product_id` too the
moment a variant is deleted — destroying which PRODUCT the slot names, not
just which variant. "Belongs to this product" is instead proven in
application code, in two places proportional to who writes: the artist's own
writes (user-scoped client, the editor) get it in the RLS `WITH CHECK`
(`variant_id is null or exists (select 1 from product_variants pv where
pv.id = variant_id and pv.product_id = product_id)`); the checkout snapshot
write (service-role, bypasses RLS) gets it in `resolveBundleLines`, which
resolves a bundle's declared `variant_id` ONLY within that component's own
product's variant list — the same scoping `computeAddonLines` already uses
for a direct purchase, re-checked at sale time regardless of what the RLS
layer already proved on write (the SHOP-VIS-001 money-path posture). A `tests/
db/bundle-items-rls.test.ts` case DOCUMENTS this boundary explicitly: the
service role is NOT stopped from writing a cross-product `variant_id` (by
design — RLS does not apply to it), with a comment naming exactly which
application-code check is the real guard, so a later reader does not mistake
the absence of a DB-level composite guard for an oversight.

**What shipped, shared model** (`packages/shared/src/bundles.ts`).
`BundleItem` gains `variantId`. `bundlePurchasable` gains a
`component_needs_variant` reason and a widened per-component input
(`BundleComponentResolution`: quantity, variantId, productHasActiveVariants,
resolved) — the honest remnant of GC7, narrowed from "any active variant on
the product refuses the whole bundle" to "a product that NEEDS a choice and
got none." New `resolveBundleComponent(variantId, catalogInfo)` is the ONE
place that decides which stock number a component consults: the chosen
variant's when `variantId` resolves, the product's own when the product has
no active variant, null (unresolved) otherwise — called from BOTH the money
path (`goods-checkout.ts`) and the display mirror
(`[slug]/shop/checkout/page.tsx`), closing the exact kind of duplicate-rule
drift that made GC7 need a "round-2 verifier executed both gates side by
side" fix in the first place.

**What shipped, checkout** (`resolveBundleLines`, `goods-checkout.ts`).
Validates, per component: product exists in the sellable catalog; if the
bundle's slot names a variant, it must resolve within THAT product's OWN
active-variant list (never a global lookup — a cross-product or unknown id
simply does not match, which is both the "exists" and "belongs to this
product" checks in one comparison); `productAvailability` still gates drops/
preorder/status (SHOP-DROP-001, unchanged); sufficient stock at the resolved
level (variant or product) for `perBundle x lineQty`; bundle price stays
authoritative from the row (unchanged). The snapshot write now carries
`variant_id` + `variant_snapshot` (the variant's name at resolution time) per
component.

**What shipped, fulfilment** (`order-fulfillment.ts`). `expandInventoryMovements`
now selects and passes through the snapshot's `variant_id`/`variant_snapshot`
instead of hardcoding null, so `decrementInventory`/`restockInventory` — which
already branch on `variant_id` first — take the SAME variant-stock branch a
direct variant purchase would, with no separate code path to keep in sync
(SHOP-FUL-001's symmetry argument extends unchanged: both directions read
through the one expansion rule). A component whose variant was later deleted
(the FK's `ON DELETE SET NULL`) carries `variant_id: null` with the
`variant_snapshot` TEXT intact, so display history survives even though there
is no live counter left to move.

**What shipped, a gap found and fixed in the same slice**
(`goods-variants.ts`). `reconcileVariants`' removed-variant guard (decides
hide-vs-hard-delete when the artist removes a variant from a product's form)
checked only `booking_interests.variant_id` and `order_items.variant_id`
before this slice. A variant sold ONLY inside a bundle writes no
`order_items.variant_id` row at all — the sale lives in
`order_item_bundle_components`'s snapshot instead — so such a variant looked
unreferenced and was hard-deleted, and the FK's `ON DELETE SET NULL` would
then null the snapshot's `variant_id`, leaving a later refund's restock to
fall through to the product-level branch (untracked by convention for a
variant-tracked product) and move nothing back. Fixed by adding
`order_item_bundle_components.variant_id` as a third reference leg, tested in
a new `goods-variants.test.ts` (positive control: no references anywhere ->
hard delete; baseline: direct order reference -> hide; the fix itself:
bundle-only reference -> hide, not delete; the reference check is scoped to
the specific variant id).

**What shipped, editors.** Web (`bundles-manager.tsx`): a variant-bearing
product renders a `<select>` per slot instead of a single quantity stepper,
plus a "+ Add another variant" action so the same product can hold two slots
at two variants; Save is disabled and a "needs a variant" message shown while
any slot on a variant-bearing product carries no selection. Native
(`apps/mobile/app/(tabs)/goods/bundles.tsx`): a variant-bearing product
renders one `FilterChip` per active variant (tap to add/remove that exact
slot) instead of a single product toggle; an existing slot with no variant on
a product that now HAS variants gets its own "needs a variant" callout with a
Remove action (chips alone cannot represent a null-variant slot, so it would
otherwise be invisible and un-fixable in the UI). Both write through the SAME
`setBundleItemsCore` (`lib/server/bundles.ts`), whose identity key changed
from `productId` alone to `(productId, variantId)` — de-dupe, held-lookup,
update and delete all now match on the pair, using `.is("variant_id", null)`
for the null case (`.eq(col, null)` is a different PostgREST predicate and
would silently match zero rows). Wire: `MobileBundleList` gains
`items[].variantId` and `products[].variants[]` (id/name/priceAmount), both
ADDITIVE (an older app build never reads them). `docs/web-native-parity.md`
updated in the same change (founder rule).

**Mutation proofs** (money-path requirement). Two guards were deleted, the
named test confirmed red, then the file restored byte-exact (sha256 compared
before/after): (1) the cross-product variant scoping in `goods-checkout.ts`
(temporarily pooling every catalog product's variants instead of the
component's own) turned "FD6: refuses a bundle slot whose variant id does not
belong to ITS OWN product (cross-product)" red; (2) the stock comparison in
`bundlePurchasable` (`packages/shared/src/bundles.ts`, temporarily short-
circuited to `false && ...`) turned both "consults the VARIANT's stock, not
some other number, for the boundary" (shared model) and "FD6: refuses when
the declared variant is short on stock" plus the pre-existing product-level
stock test (`goods-checkout.test.ts`) red, confirming the check is shared
across both stock levels.

**Deliberately NOT built in this slice.** A buyer-facing variant PICKER at
checkout: the variant is the ARTIST's fixed choice, baked into the bundle's
recipe when built, not a buyer-time selection — the bundle is still bought as
one unit. `addProductToBundleCore`/`removeProductFromBundleCore` (lower-level
single-item helpers, not reachable from any UI — the editors use
`setBundleItemsCore`'s full-list replace) gained an optional `variantId`
param for API consistency but were not otherwise redesigned. A DB-level
composite FK proving "variant belongs to product" was considered and
rejected (see above) in favour of the RLS + application-code pair.

**Validation.** `npx tsc --noEmit` clean (web); `npx tsc --noEmit` clean +
`node scripts/check-lucide-icons.cjs` clean (mobile, 138 icon imports OK);
`eslint` 0 errors on every touched file. Full `npx vitest run`: 172 files,
2992 passed + 1 expected fail (2993 total) — up from the 2967-passed baseline
by exactly the 25 tests this slice added (11 in `lib/__tests__/bundles.test.ts`
incl. the new `resolveBundleComponent`/`component_needs_variant` describe
blocks, 2 in `order-fulfillment-expansion.test.ts`, 3 net in
`goods-checkout.test.ts` incl. the SHOP-VAR-001 test's rename to the FD6
un-selectable case, 5 in `lib/server/__tests__/bundles.test.ts`, and 4 in the
new `goods-variants.test.ts`), zero regressions. `tests/db/
bundle-items-rls.test.ts` gained 6 new cases (two-variants-two-slots,
same-variant-twice-refused, cross-product-refused, cross-artist-refused,
null-variant-always-accepted, the service-role boundary documentation) but
**could not be executed in this session**: `pnpm test:db` requires a local
Supabase/Docker stack, and Docker was not running in this environment
(`supabase status` failed with "cannot connect to the docker API"). These
cases are typechecked and lint-clean but UNVERIFIED against a live Postgres;
flagging for whoever next has Docker available, or for the release-sequencer
before this migration is applied.

**Update (2026-08-01, FD12 session): this handoff was actioned, and the flagged
gap was real.** Docker was started and the full `pnpm test:db` suite run for
the first time since this note was written. `bundle-items-rls.test.ts >
refuses a variant that belongs to a DIFFERENT product, even the SAME owner's
(RLS, 42501)` FAILS: `error?.code` is `undefined` (the insert SUCCEEDED)
instead of the expected `42501`. Reproduced twice, in isolation and inside the
full suite, on a freshly `supabase db reset` database — not flaky, not
environment noise. This is a genuine, previously-never-executed RLS gap in the
FD6 slice (migration 0138 / `bundle-items-rls.test.ts:339-385`): a bundle slot
can apparently be saved with a variant that belongs to a product OTHER than
the one the slot names, which the positive control two lines above proves is
supposed to be refused. Out of scope for FD12 to fix (money-adjacent schema
this session does not own the context for); reported to the team lead for
routing to whoever owns FD6/0138 next. Two OTHER pre-existing, unrelated
`test:db` failures were also found and confirmed unrelated to any file this
session touched: `appointment-payments-convergence.test.ts`'s "restores the
WHOLE constraint set" / "restores the indexes too" drop-and-restore its
re-run list at `[0125, 0126, 0127]`, which predates 0131
(`payment_collection_processor_cost.sql`) and 0136 (`fee_tier_stamp.sql`)
adding their OWN constraints to `payment_collections` — those two migrations'
constraints on that table are consequently never exercised by this
convergence proof, a test-coverage gap rather than evidence 0131/0136
themselves fail to converge. `appointment-payments-rls.test.ts`'s "a SENT
request with a token hash is invisible to the anon key" fixture (line ~2066)
inserts a `sent_at`-populated row without `fee_schedule_version`, which
`payment_requests_fee_version_check` (present since 0125) has always
rejected — the fixture cannot have run successfully since that constraint
existed. Separately, this session found and fixed a REAL local-only
environment footgun while validating migration 0139 (see the FD12 entry
below): `supabase/seed.sql` was missing the REVOKE mirror for the two new
`refunds`/`refund_lines` tables, reproducing the exact `payment_allocations`
footgun 0125's own seed.sql comment already documents (`GRANT ALL` in
seed.sql runs AFTER migrations on a local reset and silently undoes a
migration's own REVOKE) — now fixed for the new tables; the fix does not
touch prod, since seed.sql never runs there.

## FD12: partial refunds engine + native revise (2026-08-01, ready for review)

Founder ruling FD12 (`plus-build-time-decisions.md`, "partial refunds + native
revise are pre-publication scope; SUPERSEDES the Track A leftovers by
design"). Full report delivered to the team lead via SendMessage; this entry
is the durable summary.

**What shipped.**

- Migration `0139_refund_ledger.sql`: a domain-generic (`appointment_payment` |
  `goods_order`) immutable refund ledger, `refunds` + `refund_lines`, SELECT-only
  for the owning artist / service-role-only writes (same posture as
  `payment_allocations`/`payment_collections`), composite-FK ownership
  (`refunds_payment_request_fk`, `refunds_order_fk`, `refund_lines_refund_fk`),
  a domain/subject CHECK, and a unique `idempotency_key` that is the
  duplicate-refund CLAIM GATE. Plus `processor_cost_minor` /
  `processor_cost_status` / `processor_cost_retained_minor` /
  `fee_refund_policy_version` on `orders`, mirroring 0131's columns on
  `payment_collections` (captured only at STANDALONE order settlement —
  add-on orders share a PI with the deposit, so their processor cost is not
  goods-attributable, the same entangled-PI reasoning `goods-refund.ts`
  already documents for refund amounts).
- `appointment-payment-refund.ts` (existing, tested file — additive only, zero
  behaviour change when the new params are omitted): quantity-based `by_line`
  refunds (`lineQuantities`), a per-line remaining-balance fix (see Findings),
  a best-effort immutable ledger write + per-line `refund_status` update after
  Stripe confirms, a `remainingRefundableMinor` field on the ok result, and a
  buyer confirmation email (`sendRefundConfirmationEmail`).
- `goods-order-refund.ts` (new): the by-line/quantity/custom-amount engine
  goods orders never had (the existing `goods-refund.ts` is the WEBHOOK
  convergence backstop for an out-of-band refund and is unchanged). Full /
  by-line-with-quantity / custom-amount, restock SELECTION via the existing
  `expandInventoryMovements`/`restockInventory` (no second classifier),
  discount cap-release gated on genuine full unwind (by amount, so it fires
  correctly even when reached across several partial refunds), the same
  PAY-RFD-002 fee/processor-cost policy reused via a new pure helper
  (`refund-fee-treatment.ts`, factored out of the appointment core's decision
  logic), and the pre-Stripe-call claim gate (`refund-ledger.ts`) as this
  lane's ONLY duplicate-refund defense (unlike the appointment lane, which
  already had a deterministic Stripe idempotency key).
- Web UI: `RefundControl` (appointment) rebuilt for full/by-line-with-quantity/
  custom-amount with a two-step confirm; a new goods order detail page
  (`goods/sales/[id]`) + `GoodsRefundControl`, linked from the sales table.
- Native: `apps/mobile/app/bookings/payments/[id]/revise.tsx`, the screen the
  app never had (route existed since A7). `docs/web-native-parity.md` updated
  in the same change (founder rule), including the reachability residual
  (no native list/detail screen exists yet to link this from).

**Findings from this rebuild, not carried in from elsewhere.**

1. **A real over-refund-by-misattribution bug in the EXISTING `by_line`
   branch**, found while adding quantity support. The old code summed a
   selected line's FULL ORIGINAL allocation on every call; re-selecting an
   already-refunded line while ANOTHER line still held balance summed too
   much, and the overall `maxRefundable` clamp then silently reattributed the
   excess to the wrong line instead of refusing it. Fixed by tracking each
   line's OWN remaining balance via the new ledger
   (`sumRefundedAmountForRequestLine`); mutation-tested
   (`appointment-payment-refund.test.ts`, "does not misattribute an exhausted
   line's balance to another line").
2. **The `full` refund type had NO cross-check against the order-level
   `maxRefundable`** in the new goods engine's first draft (only `by_line`
   did) — a prior bare custom-amount refund (which touches no per-item row)
   could let a later `full` refund proceed on stale per-item math alone.
   Fixed by moving the check to apply uniformly to both, refusing on
   disagreement rather than silently clamping (which would misattribute the
   restock too); mutation-tested (`goods-order-refund.test.ts`, "refuses a
   full refund when the per-item ledger disagrees with the order-level
   balance").
3. **A test-mock key collision** self-found while writing
   `goods-order-refund.test.ts`: two different queries against the SAME table
   (`sumSucceededRefundedMinor`'s list select vs. the claim gate's
   single-row fallback select on `refunds`) shared one FIFO reply queue in
   the naive mock, which would have silently fed one call's fixture to the
   other. Fixed by keying the mock on `.maybeSingle()` vs. bare `await`
   (a real distinction a live Supabase client also makes), not by table+verb
   alone.
4. **The `seed.sql` REVOKE-mirror footgun (0125's own documented pattern)
   recurred for the new tables**, found by executing `supabase db reset` and
   watching `refund-ledger-rls.test.ts`'s INSERT/UPDATE/DELETE/TRUNCATE
   refusals go green with no error. Fixed in `seed.sql`, matching the exact
   comment 0125 left for `payment_allocations`/`payment_collections`.
5. **Three pre-existing `test:db` failures unrelated to this session**,
   found because this is the first `pnpm test:db` run since the FD6 slice
   above and since 0131/0136 shipped — recorded in the update note directly
   above this entry, not repeated here.

**Deliberately not built, with reasoning (per the brief's own allowance).**
A pre-Stripe-call claim gate for the APPOINTMENT lane: it already has a
deterministic Stripe idempotency key (M11) that makes a second layer lower
value there; adding one would touch the existing tested Stripe-call code path
for marginal benefit, so the appointment core's ledger write stays
post-Stripe-success and best-effort, and the goods lane (which had NO
pre-existing dedupe) gets the pre-flight claim gate instead. Processor-cost
capture for ADD-ON (booking-entangled) goods orders: not attributable to
goods alone on a shared PI, same reasoning `goods-refund.ts` already uses for
refund amounts; those orders read the cost as null and fail safe. A native
payment-request LIST/DETAIL screen: FD12 named native REVISE specifically;
building the full management surface is materially larger scope than this
ticket, and the revise screen's reachability gap is named rather than papered
over (see `docs/web-native-parity.md`).

**Validation.** `npx tsc --noEmit` clean (web + mobile) + `node
scripts/check-lucide-icons.cjs` clean (138 icons). `eslint` 0 errors on every
touched/new file. Full `npx vitest run`: 173 files, 3018 passed + 1 expected
fail (3019 total) — up from the 2992-passed baseline by the ~26 tests this
slice added, zero regressions. `pnpm test:db`: migration 0139 applied via
`supabase db push` AND from a full `supabase db reset` (clean rebuild from
0000-0139), constraint-drop-and-restore falsification executed on
`refunds_payment_request_fk` (dropped -> red -> re-ran 0139 alone -> restored
-> green), 17/17 new `refund-ledger-rls.test.ts` cases pass, all of
`appointment-payment-refund.test.ts` (46, up from ~39) and the new
`goods-order-refund.test.ts` (17) pass; the 3 pre-existing failures above are
the only red in the full 235-test `test:db` suite.

## FD2: native gallery editor at full parity (2026-08-01, ready for review)

Founder ruling FD2 (`plus-build-time-decisions.md`, "native gallery editing
ships BEFORE publication; SUPERSEDES D4"). Full report delivered to the team
lead via SendMessage; the durable implementation note is in
`plus-build-time-decisions.md` under the same heading — this entry is the
short progress-log summary.

**What shipped.** Native Link Hub image-gallery editing reaches the ruling's
full required scope (device upload, delete, reorder, caption editing, a
layout picker as the closest native analog to "visibility controls",
entitlement + downgrade lock states, upload progress, retry with the picked
file kept rather than discarded, unsupported-file handling via the server's
existing validator, empty states, safe render), replacing D4's read-only
"edit on the web" summary. New shared server module
(`hub-gallery-upload.ts`) so the web direct-upload action and the new
`POST /api/mobile/settings/hub/gallery-image` route enforce identical
entitlement/ceiling/upload gates. Deliberately not ported: "Import from URL"
(FD4) — not in FD2's named scope list, and its own SSRF-guard + rate-limit
posture is a separate scope decision. `docs/web-native-parity.md` updated in
the same change (founder rule).

**Verified rather than assumed:** the brief flagged the native save path's
orphan cleanup as a thing to check for a gap. It was already correctly
wired (`removeDroppedHubImages` inside `POST /api/mobile/settings/hub`,
shipped with that route) — confirmed by reading the route and now pinned by
a new test, not a defect found or fixed this slice.

**Validation.** `npx tsc --noEmit` (web) clean, `pnpm typecheck` (mobile)
clean, eslint 0 errors on every touched file. Full `npx vitest run`: 175
files, 3031 passed + 1 expected fail (3032 total), up from the
3018-passed/1-expected-fail baseline (`48cfbab2`) by exactly the 13 tests
this slice added (9 new-route tests, 4 hub-route tests), zero regressions.
`pnpm test:db`: 235/235 green on a clean run (one run hit an unrelated
Windows/Docker worker-crash flake with no failing assertion; this slice
touches no schema/RLS/migration). RN component logic is outside the vitest
include, stated as a real coverage limit rather than papered over.

## FD5: wishlist + seller-scoped carts (2026-08-01, ready for review)

Founder ruling FD5 (`plus-build-time-decisions.md`, "wishlist +
seller-scoped carts BEFORE goods commerce enables; SUPERSEDES GC5's
deferral"), the LAST FD build slice and the founder's named "hardest
invariant in the whole build". Full report and the three mandated design
decisions delivered to the team lead via SendMessage; the durable
implementation note (design justifications, seller-boundary proof,
reuse-not-rebuild reasoning) is in `plus-build-time-decisions.md` under the
same heading — this entry is the short progress-log summary.

**What shipped.** Migration `0141`: `shop_carts` (one per guest identity per
artist, per the ruling's "never cross-artist payments"), `shop_cart_items`,
`shop_wishlist_items` (cross-artist, per "wishlist MAY span artists"), plus
an additive nullable `orders.cart_id`. Guest identity is an httpOnly cookie
token (only its hash stored), matching the `booking_requests.customer_token_hash`
pattern — VERIFIED first that no buyer-account concept exists anywhere in
the product. Cart/wishlist UI lives on the existing `/[slug]/shop/checkout`
page (heart-toggle wishlist, Add to cart, a persisted cart summary, a
"Checkout cart" action) alongside the existing, unchanged, self-contained
"Buy now" flow, plus a new cross-artist `/wishlist` page. Cart-to-checkout
never accepts client-submitted selections: it reads the buyer's own stored
cart rows server-side and hands them to the SAME, unmodified
`createStandaloneGoodsCheckoutCore` "Buy now" already uses, with one
additive `cartId` thread (stamped on the order at create, read at settle to
clear the cart — successful-payment cleanup; left untouched on a
failed/abandoned attempt so the buyer can retry).

**The seller boundary.** Enforced at the schema level, not just in
application code: `shop_cart_items.artist_id` is bound by two composite
foreign keys at once (to its own cart's owner AND to its product's/bundle's
owner), making a cross-artist row unrepresentable for any role, including
the service role that is the table's only writer. `tests/db/shop-carts-seller-boundary.test.ts`
proves this by attempting the forbidden insert three ways and observing
`23503` each time, plus a positive control. `resolveCartSelectionsForCheckout`
additionally asserts the same invariant in application code as
defense-in-depth, refusing the ENTIRE checkout (never a partial cart) if it
ever fires.

**Validation.** `npx tsc --noEmit` (web) clean, `pnpm --filter inklee
typecheck` clean, `pnpm --filter @inklee/mobile typecheck` clean (no mobile
files touched — mobile parity for this slice is 🌐 by decision, matching the
established pattern for every buyer-facing commerce surface; see
`docs/web-native-parity.md`). `eslint` 0 errors/warnings on every
touched/new file (a full-repo `pnpm lint` in this session separately failed
on ~150 pre-existing errors inside the gitignored, locally-generated
`apps/web/supabase/.temp/...` directory — unrelated to any source change).
Full `npx vitest run`: 180 files, 3099 passed + 1 expected fail (3100
total), up from the 3031-passed/1-expected-fail baseline by exactly the 68
tests this slice added, zero regressions. `pnpm test:db`: 255 passed, up
from the 235 baseline by exactly the 20 new tests in
`shop-carts-rls.test.ts` (15, RLS lockdown for all three new tables) and
`shop-carts-seller-boundary.test.ts` (5, the schema-level mutation proof),
zero regressions; every new schema object verified to actually exist against
the local Postgres instance before any test was written against it, per the
AGENTS.md convergence rule.

## C1.1/C1.2/C1.3: goods checkout consumer-law disclosures (2026-08-02, ready for review)

Counsel answers C1.1-C1.3 (`docs/legal/counsel-accountant-handoff-2026-08.md`
Part 4), implemented against the standalone shop checkout
(`/[slug]/shop/checkout`) and its settlement receipt only, per the assigned
brief. Wording marked verbatim in the code is counsel's own text with only
the bracketed variables filled in.

**What shipped.** Migration `0142`: three nullable `profiles` columns
(`seller_trading_name`, `seller_address`, `seller_contact`) plus the
mandatory 0074-pattern `GRANT UPDATE` extension (and its `seed.sql` mirror);
`products.custom_made` (the artist's per-product Art. 16(c) declaration);
`order_items.custom_made_snapshot` and
`order_item_bundle_components.custom_made_snapshot` (sale-time freezes,
same pattern as `title_snapshot`/`variant_snapshot`). New shared pure module
`packages/shared/src/consumer-disclosures.ts` holds every text decision
(`sellerDataComplete`, `sellerDisclosureBlock`, `returnRightNotice`,
`CUSTOM_MADE_NOTICE`, `summarizeReturnDisclosure`, `buildOrderReceiptBody`,
`ORDER_WITH_OBLIGATION_LABEL`) so the checkout page, the checkout UI and the
receipt email all read the same answer, and so the decision logic is
directly testable outside the `.tsx` surfaces vitest doesn't cover.

**The seller-data gate (C1.1's prerequisite).** "Artists without complete
seller data cannot enable the shop" is enforced as a real refusal, not a
UI-only hint, at four points: the checkout page (`notFound()`, same posture
as the existing `shopCheckoutEnabled` 404), the checkout actions
(`startShopCheckoutAction`, `resolveShopArtist` — the latter shared by every
cart/wishlist/checkout action), and the money-path core itself
(`createStandaloneGoodsCheckoutCore`, the actual authority). A fifth point
refuses to let the artist turn the standalone-shop toggle ON at all without
complete data (`saveShopCheckoutEnabledAction`). A new `SellerDetailsForm`
on `/goods` lets an artist fill the three fields in.

**Custom-made (C1.2).** Per-product checkbox in the goods editor
(`product-form-fields.tsx`), threaded through `computeAddonLines`'
`AddonProduct`/`OrderLine` (shared with the appointment add-on compositor —
see the open finding below) and `resolveBundleLines` (a bundle is treated as
non-returnable if ANY component is custom-made; an engineering judgment
call, not counsel-confirmed wording, since counsel's answer does not name
bundles). Rendered at the product, in the cart, at checkout and in the
receipt; a mixed cart renders BOTH the standard return notice and the
custom-made exemption, named explicitly by counsel as the case that must
never collapse to one or the other.

**The receipt (C1.3).** `settleStandaloneGoodsOrder`'s buyer email now
carries the full required set via `buildOrderReceiptBody`: the C1.1 seller
block (which already contains the delivery arrangement and the complaint
route, so those are not duplicated), items/prices/total, the C1.2 return or
custom-made notice, the applicable Terms text (`getLegalDoc("terms")`,
mirroring the approved Plus E2 pattern of inlining the full text rather than
a link), and the closing durable-medium line. A new
`/[slug]/shop/withdrawal-form` page (standard EU Annex I(B) boilerplate,
addressed to the artist as seller) is linked from the return notice.

**Button label.** `PayInner`'s pay button (the one that actually triggers
`stripe.confirmPayment`, i.e. the Art. 8(2) order-placing action — the
earlier "Buy now"/"Checkout cart" buttons only create the intent) now reads
`Order with obligation to pay {amount} to {artist}`, keeping the amount
visible per counsel's instruction.

**An open gap raised proactively, not fixed:** the appointment add-on /
deposit checkout shares `computeAddonLines` with the standalone shop but was
never in scope for this task, so it can sell a custom-made product with none
of these disclosures. Recorded as `GOODS-DISC-001` (confidence: hypothesis,
not reproduced end-to-end) rather than silently left unnoted.

**A pre-existing defect fixed in passing, unrelated to this feature:**
`pnpm test:db` (run because this task added migration `0142`) turned up 10
failures in `tests/db/shop-carts-rls.test.ts` — a gap in `seed.sql`'s
mirror of `0141`'s RLS lockdown that a prior audit pass (`SEED-GRT-001`)
had already predicted by name ("the three shop_* tables from 0141 are
latent until the next db reset"). Fixed by adding the missing
`REVOKE ... FROM anon, authenticated` mirror to `seed.sql`; `SEED-GRT-001`
updated with the new evidence and left `in-progress` (the growth-views
instance the same finding also documents is untouched).

**Validation.** `npx tsc --noEmit` clean. `eslint` on every touched file:
zero errors (pre-existing unrelated warnings elsewhere untouched). Full
`npx vitest run`: 184 files, 3145 passed + 1 expected fail, up from the
3103-passed/1-expected-fail baseline by exactly the tests this task added
(18 new in `consumer-disclosures.test.ts`, plus new cases in
`goods-checkout.test.ts`, `actions.test.ts`, `cart-actions.test.ts` and
`shop-checkout-toggle-action.test.ts` for the seller-data gate), zero
regressions. `pnpm test:db`: 255/255 green after the `seed.sql` fix above
(was 245/255 before it, on a stack that included this task's own migration
`0142` — the failures were entirely the pre-existing `seed.sql` gap, not
`0142`, which was verified column-by-column and grant-by-grant against the
local Postgres before any test ran).

**Audit register.** `docs/audit/findings.yaml`: `SEED-GRT-001` updated
(history entry, `remediation.status: in-progress`); new finding
`GOODS-DISC-001` (the add-on-checkout gap, `hypothesis`/`open`); new
coverage row for this task's own scope, naming what was and was not
covered. `pnpm audit:validate` and `pnpm audit:generate` both clean.

## C1.4: guest-buyer retention purges (2026-08-02, ready for review)

Counsel's retention table (`docs/legal/counsel-accountant-handoff-2026-08.md`
Part 4, C1.4) implemented as four independent purge functions, wired into
the pre-existing `retention-purge` cron, plus the checkout privacy notice
and a records-of-processing entry. Counsel named this the launch blocker:
"Build the purge jobs before the shop switches on — the cancelled-order
purge is the one with no current path and no lawful anchor without it."

**What shipped.** New pure module `apps/web/src/lib/server/retention-cutoffs.ts`
(`financialYearRetentionCutoff`, `daysAgoCutoff`, `monthsAgoCutoff`) —
factored out so the pre-existing cron's own 7-year and 24-month cutoffs and
this task's new ones share one implementation instead of two copies that
could quietly diverge. New `apps/web/src/lib/server/shop-retention.ts`:
`purgeCancelledStandaloneOrderEmails` (30 days),
`purgeCompletedStandaloneOrderEmails` (7y from financial-year-end),
`purgeAbandonedCarts` (30 days since last activity), and
`purgeInactiveWishlistItems` (12 months), all scoped to standalone orders
(`booking_id IS NULL`) only — a booking-linked order's `client_email`
follows the booking's own retention story, not this one. No migration: every
column these purges need already exists (`orders.client_email/updated_at`,
`shop_carts.updated_at`, `shop_cart_items.updated_at`,
`shop_wishlist_items.created_at`).

**A real constraint conflict found by the tests, not by inspection.** The
first version erased a cancelled/completed order's email with
`client_email: null`. Every purge against a real fixture failed with `new
row for relation "orders" violates check constraint
"orders_buyer_identity_check"` — migration 0134's own invariant
(`booking_id IS NOT NULL OR client_email IS NOT NULL`, "an order must always
have someone to fulfil to") categorically forbids nulling the email on a
booking-less order. Counsel's own answer offered the fork ("erase **or**
pseudonymise"); fixed by pseudonymising to a single constant,
non-identifying placeholder (`PURGED_EMAIL_PLACEHOLDER =
"purged@retention.inklee.invalid"`) shared by every purged row — no
per-subject reversible link is kept, so this is erasure of the personal data
with a schema-satisfying tombstone, not a true reversible pseudonym. Filters
use `.neq(client_email, placeholder)` rather than `.not(...,"is",null)` so a
second run is idempotent and never re-matches an already-purged row.

**The eight-block sequencing flaw, fixed, not appended to.** The
pre-existing `retention-purge` cron was eight sequential blocks that each
`return`ed a 500 the instant its own delete errored, stranding every step
after it with no retry until the next scheduled run, and had zero tests.
Refactored every step (the original eight plus the four new C1.4 steps)
into an independent `runStep`/`runShopRetentionPurges` pattern: one step's
error is captured to Sentry and reported in an `errors` array, but every
OTHER step still runs and its count is still reported; the route still
500s if anything failed, so cron monitoring still alerts.
`route.test.ts` (new; the route had none before) proves a failing early
step does not block later ones, that C1.4 failures merge into the same
error list, and the happy-path 200.

**Privacy notice + records of processing.** The checkout email field's
helper text now reads counsel's verbatim wording ("We use your email for
your receipt and so {artist} can arrange delivery. It is kept as part of
the order record.") with a real `/privacy` link (`shop-checkout.tsx`).
New `docs/legal/records-of-processing-guest-shop.md`: the first standalone
Article 30 register entry (categories, recipients, legal bases, the
retention table, and a pointer to the implementation), since no
consolidated register file previously existed — earlier processing
activities are described in prose across
`docs/account-deletion-handoff.md` rather than as a register entry.

**Tests, all at the exact boundary.** Every rule proven with a fixture on
each side of its cutoff (one day inside the window survives, one day past
it does not) against the real local Postgres in
`tests/db/shop-retention-purge.test.ts` (15 tests): cancelled-order
pseudonymisation (29d survives / 31d purged / idempotent re-run), the
financial-year-end arithmetic specifically proving it is NOT naive "7 years
from the order date" (a row dated 1 Jan of a financial year survives past
the point a naive per-row-date formula would already have purged it; a row
dated 31 Dec of the prior year is purged), abandoned-cart deletion keyed to
the MORE RECENT of the cart's own `updated_at` and its items' `updated_at`
(shop-cart.ts never touches the parent cart row on add/update/remove, so a
cart-only check would purge an actively-shopped cart), and wishlist
12-month inactivity. A separate pure unit suite
(`retention-cutoffs.test.ts`, 5 tests) pins the exact ISO instants the
financial-year formula must produce, independent of any DB. Mutation proof
on the cancelled-order purge (the one counsel flagged by name): function
body replaced with `return { count: 0 }`, named test
("is pseudonymised at 31 days old ... — MUTATION-PROVEN") went red along
with two tests that transitively exercise the same function, file restored
to its exact prior content (sha256
`3d1735e21256ad3ac13c54f4ad8c1f879ffe8e5ad3c11c3e83d6ff0efe848b70` before
and after), suite green again.

**Validation.** `npx tsc --noEmit` clean (one real error surfaced and
fixed along the way: `runStep`'s callback type was `Promise<...>`, which a
`PostgrestFilterBuilder` satisfies structurally but not nominally —
widened to `PromiseLike<...>`). `eslint` on every touched file: zero
errors. Full `npx vitest run`: 186 files, 3159 passed + 1 expected fail
(this task's own additions: 9 unit tests, in `retention-cutoffs.test.ts`
and the new cron `route.test.ts`; the total also reflects concurrent work
from other workers in this shared session), zero regressions attributable
to this change. `pnpm test:db` full run: 20 files, 281/281 green on a
clean run; two earlier runs in the same session showed a DIFFERENT
unrelated file failing each time (`account-deletion-retention.test.ts` +
`appointment-payments-convergence.test.ts` once, then
`payment-request-intent-race.test.ts` with a literal "deadlock detected"
Postgres error the next) — the fingerprint of another process hitting the
same local Supabase concurrently (multiple agents share this session), not
a regression: `shop-retention-purge.test.ts` itself passed in every run,
including when isolated alongside the two files that failed in the full
run, and a subsequent full clean run passed 281/281 with no retries or
code changes in between.

**Findings raised, not fixed here (reported to the team lead, who owns
`docs/audit/findings.yaml` for this workstream):** the
`orders_buyer_identity_check` conflict above, and the pre-existing
zero-test/non-independent-step state of `retention-purge/route.ts` before
this change.

## C1.4 follow-up: BDEL-RET-002, the inverse retention gap (2026-08-02, ready for review)

Relayed mid-task by the team lead from the account-deletion worker
(`docs/audit/findings.yaml` `BDEL-RET-002`): migration 0129 moved five
billing tables from CASCADE to `ON DELETE SET NULL` so they survive account
deletion, correctly fixing the retention promise, but gave them no purge
deadline — so a deleted account's billing/tax/consent rows now survive
INDEFINITELY, the same compliance failure counsel §8 forbids, just pointing
the other way. Landed in the same commit family as C1.4 per the team lead's
request, reusing the exact same 7-year-from-financial-year-end arithmetic.

**What shipped.** New `apps/web/src/lib/server/billing-record-retention.ts`:
`purgeDeletedAccountWithdrawalCases`, `purgeDeletedAccountBillingContract
Confirmations`, `purgeDeletedAccountBillingConsentRecords`,
`purgeDeletedAccountBillingSubscriptions`, and an orchestrator
`runBillingRecordRetentionPurges` wired into the same `retention-purge`
cron via the same independent-step pattern. Scope is deliberately narrow:
ONLY rows already de-identified by 0129 (`artist_id IS NULL`) — a row still
attached to a live artist is ordinary ongoing billing history, not this
gap, and purging it is a separate, bigger question this does not answer.

**A fifth table is deliberately excluded, not silently dropped.**
`transaction_tax_snapshots` has an append-only trigger
(`tts_no_mutation`/`tts_block_mutation()`, migrations 0106/0129) that
raises on EVERY delete unconditionally — "transaction_tax_snapshots is
append-only; corrections are new rows." That is a deliberate
accounting-ledger immutability control, not an oversight, and this task
does not touch it: whether tax snapshots should ever become deletable is a
separate decision this worker is not authorized to make unilaterally.
Flagged to the team lead rather than resolved. One direct, correct
consequence: `billing_subscriptions.purge` also excludes any subscription
still referenced by a `transaction_tax_snapshots` row, which in practice
means a subscription that ever had a real tax event is retained
indefinitely too — matching the permanence of the ledger entry that points
to it, not a bug in the exclusion logic.

**FK ordering, proven not just asserted.** None of the FKs among the four
purged tables carry `ON DELETE CASCADE`/`SET NULL` on each other (only the
`artist_id` FK to `profiles` does), so deleting a row still referenced by
another EXISTING row throws 23503. Purge order is leaf-to-root
(`withdrawal_cases` and `billing_contract_confirmations` first, unconditional
past their own cutoff; `billing_consent_records` next, excluding ids still
referenced by a REMAINING — not-yet-cutoff — withdrawal_case;
`billing_subscriptions` last, excluding ids referenced by any remaining
confirmation, withdrawal_case, or tax snapshot). `tests/db/billing-record-
retention-purge.test.ts` (16 tests) proves the full chain converges: a
young withdrawal_case protects both its consent record and its subscription
in one run; once that same case ages past its own cutoff, a single later
run purges the whole freed chain in the correct order with no FK violation.
A separate test proves the tax-snapshot block is permanent (checked 100
years in the future).

**Validation.** `npx tsc --noEmit` clean (one real error fixed: a dynamic
`.select(column)` on a service-role client returns a `GenericStringError`-
shaped type that doesn't structurally overlap `Record<string, unknown>`;
cast through `unknown` first). `eslint` clean on every touched file. Full
`npx vitest run`: 186 files, 3160 passed + 1 expected fail (this addition:
1 new merge-test in `route.test.ts`). `pnpm test:db` full run: 21 files,
297/297 green (up from 281/281 by exactly this task's 16 new tests, zero
regressions).

**Not decided here, needs the team lead's call:** whether
`transaction_tax_snapshots`'s permanent retention is acceptable as-is
(likely yes, given it is a deliberate accounting-immutability control) or
whether it needs its own counsel-reviewed decision about ever becoming
deletable.
