# P5d base-commit review — `0de2034`

**Reviewed:** `0de2034` `feat(mobile): native discount and product-scheduling editors (P5 parity)`.
**Author/date:** Michel Kraeft, 2026-07-29 09:45:55 +0700.
**Why it is in scope:** it is the BASE COMMIT of `feat/p5d-collections`, so it merges to `master` with that branch.
**Date of review:** 2026-07-29.
**Verdict: ✅ CLEAN.**

---

## Why a base commit needed its own review

`0de2034` was never meant to be part of P5d. It is native parity work for P5b
and P5c, and the record said native discount parity was "in progress, paused for
P5d completion".

That was false in a way that only shows up at merge time, and it took two
corrections to state properly:

1. `0de2034` was committed directly to **local** `master` and **never pushed** to
   `origin/master`. It was also never reviewed. Local `master` was reset to the
   remote so `master` stopped carrying unreviewed, unpushed work.
2. That reset did **not** solve the actual problem, and the first version of the
   correction claimed it did. `git log -1 --format=%P 0de2034` returns
   `d890a07`, and `feat/p5d-collections` was branched from `0de2034` itself, not
   from `d890a07`. **`0de2034` is the oldest entry in
   `git log --oneline origin/master..HEAD`.** The moment the collections branch
   merges, `0de2034` merges with it, regardless of what `master`'s local ref
   points at.

So the choice was: rewrite the branch's history to drop it, or bring it into
review scope. **Founder decision, 2026-07-29: no rebase.** Recorded in
`DECISIONS.md`. It was reviewed instead, and came back clean.

## Provenance, and what this artifact is NOT

**Read this before citing this document as authority.**

This artifact was written on 2026-07-29 by the docs and record-integrity role,
**after** the review, to give a commit that ships to production a durable review
record. It had none: the verdict existed only in session context and in one line
of `docs/roadmap.md` ("It was REVIEWED instead, and came back clean").

**The docs role did not perform this review.** The verdict below is recorded, not
re-derived. The **facts** section below WAS verified from the repository by the
docs role, with the commands shown, and is separated from the verdict for exactly
that reason.

Same honest limitation as the Gate C artifact: a clean verdict produces no
findings and so leaves no trail. This document establishes that the commit was in
scope and what it contains; it cannot establish which specific behaviours a
reviewer examined.

## Facts, verified from the repository

Every command below was run by the docs role at `32a15e8`.

**Identity and position.**

```
$ git log -1 --format=%P 0de2034
d890a076c8590ab963f8f1eb97ec32d0b236a6f3
$ git log -1 --format=%T 0de2034
0875b2d338002106f65c097ef528631fefbe4b94
$ git branch -a --contains 0de2034
  feat/native-goods-parity
* feat/p5d-collections
```

Its parent is `d890a07` (the retracted P5d commit, which IS on `origin/master`).
It lives on `feat/native-goods-parity` as the **identical commit object**, same
tree hash, not a copy, so nothing is lost by any ref movement elsewhere. It is
**not** on `origin/master`.

**Content, `git show --stat 0de2034`.** 9 files, +594 / -18:

| File | Δ |
|---|---|
| `apps/mobile/app/(tabs)/goods/discounts.tsx` | +250 |
| `apps/web/src/app/api/mobile/goods/discounts/route.ts` | +138 |
| `apps/mobile/app/(tabs)/goods/[id].tsx` | +73 |
| `apps/web/src/app/api/mobile/goods/[id]/route.ts` | +65 / − |
| `packages/shared/src/mobile-api.ts` | +29 |
| `docs/product/plus-build-progress.md` | 26 |
| `apps/web/src/lib/mobile-goods.ts` | +15 |
| `apps/mobile/app/(tabs)/goods/index.tsx` | 12 |
| `docs/web-native-parity.md` | 4 |

**Risk-relevant properties, each checked rather than assumed:**

- **No migrations.** `git show --stat 0de2034 -- apps/web/supabase/migrations/`
  returns nothing. This commit changes no schema, adds no policy, and therefore
  carries none of the merge-ordering risk that `0121`/`0122`/`0124` carry.
- **No new server cores.** Both editors are surfaces over cores that already
  exist and already shipped: `saveDiscountCore` / `setDiscountActiveCore` (from
  `7e504db`, P5b) and the P5c scheduling gate. The one-source-of-truth rule
  holds: the mobile route calls the same cores the web action calls, so the
  entitlement refusal, the duplicate-code handling and the percent/fixed unit
  conversion cannot drift between surfaces.
- **Wire changes are additive only**, which is the rule that protects installed
  builds with no OTA: a pre-P5 build sends none of the new fields and the
  route's normalizer treats absence as unset. **This is the safe direction of
  the wire rule.** Contrast the `featured_collection` block in `25dda4f`, which
  added a value to a union the app SWITCHES ON, and is a breaking wire change.
  See `docs/web-native-parity.md`, "Wire hazard".
- **Two deliberate design calls, both recorded in the commit rather than
  discovered later.** (1) Discount usage is counted from the redemption ROWS,
  matching web, because those rows are what actually enforce the cap; a counter
  would be a second source able to drift from the thing deciding whether a code
  still works. (2) Scheduling values are STRIPPED server-side for an un-entitled
  artist rather than the save being rejected, because the rest of the save is
  valid and failing a whole form over a field the artist cannot use is worse.
- **One deliberate web/native difference**, recorded in the parity register
  rather than left to be found: web takes a date AND time for a drop, the app
  takes a date and means the start of it. The stored value is a full timestamp
  either way.
- **Un-entitled state carries no price and no purchase step**, per D17 (the IAP
  steering constraint).

## The rebase that was tested and rejected

Recorded because the decision rests on it, and because the test was run for real
rather than reasoned about.

**File-level intersection** between what `0de2034` changes (vs `d890a07`) and
what the P5d commits change (vs `0de2034`): four files out of roughly forty
touched. Checked per file rather than inferred from the overlap:

- `packages/shared/src/mobile-api.ts` — **no dependency.** `0de2034` inserts two
  type blocks mid-file; P5d's `MobileCollectionList` is appended at end-of-file
  and references nothing `0de2034` added.
- `apps/mobile/app/(tabs)/goods/index.tsx` — real conflict, trivial. P5d inserts
  a "Collections" button using `0de2034`'s "Discount codes" button as the diff's
  context anchor. Both buttons stay, either order.
- `docs/web-native-parity.md` — real conflict. P5d's diff carries the
  "Drops/preorders" and "Discount codes" rows as unchanged context, and those
  rows only read ✅ in a tree that already has `0de2034`.
- Migrations — **confirmed clean.** `0120` was introduced in `d890a07` itself,
  the intended new base, so it is not replayed. `0121`+ appear only in the P5d
  commits.

**Empirical test**, on a throwaway branch, deleted afterwards:
`git rebase --onto d890a07 0de2034` was run for real. It conflicted on the FIRST
replayed commit (`805358d`), **six separate hunks, entirely inside
`docs/product/plus-build-progress.md`** — this session's own narrative log,
rewritten by nearly every P5d commit, which does not apply against a tree missing
`0de2034`'s edits to it. Aborted rather than hand-resolving eight commits, which
was not authorised. `feat/p5d-collections` was confirmed unchanged before and
after.

**Read:** the product and schema surface is genuinely independent of `0de2034`.
The conflicts are concentrated in two narrative docs plus one button-ordering
conflict. That makes the rebase cheap for the feature and expensive to get right
in the docs, across eight rounds, in a log that had already produced two recorded
self-inflicted errors that same session. Reviewing the commit costs one review
and rewrites no history. The founder took that option.

## What this verdict does not cover

- It covers `0de2034` only. It says nothing about `d890a07`, its parent, which
  is separately **RETRACTED** and whose defect is what started the whole rebuild.
- It does not authorise a merge. See the ordering constraint in
  `docs/product/plus-build-progress.md` and `docs/roadmap.md` §1.
- `0de2034`'s two native editors are **not on any installed device.** The latest
  EAS build is `da93749b` (2026-07-28, from `c00341a`), which predates this
  commit. A fresh build is needed for them to reach artists, and is separately a
  hard prerequisite before `goods_collections` is granted at all.
