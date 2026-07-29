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
| Native parity | `0de2034` | Native discount + product-scheduling editors (COMPLETE, not paused) |

Migrations 0114-0120 are applied to production and verified there.

**Live config change:** the Stripe LIVE webhook endpoint
(`we_1TpPmyHkG0exykzFYTq26SyV`) now subscribes to
`charge.dispute.created/updated/closed`, so the P5a dispute handler is
actually reachable. Verified by re-reading the endpoint.

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
| A2 | HIGH. `discount_codes` has the SAME defect, in production, on the revenue path | Migration `0123` + `tests/db/discounts-rls.test.ts` (9 tests) |
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

### Milestone 3: server behaviour — DONE (`8b3e0a1`)

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
| Fresh EAS build | The two native editors (`0de2034`) are on master but not on devices. Batch with the P5d native work rather than burning a build per slice. |
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
