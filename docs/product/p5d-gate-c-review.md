# P5d Gate C — milestones 3 to 6

**Gate:** C — server behaviour, the Hub block, native management, docs.
**Scope reviewed:** `8554e63`, `25dda4f`, `caa1be1`, `a261347` on `feat/p5d-collections`.
**Date of review:** 2026-07-29.
**Verdict: ✅ CLEAN.**

---

## Why this gate exists at all

Gate A covered one migration (`0121`, the write-policy repair). Gate B covered
one migration (`0122`, the collection model). **Milestones 3, 4, 5 and 6 had
never been reviewed by anyone.** They were built while Gate A was still
outstanding, which was a deliberate call recorded at the time
(`plus-build-progress.md`, milestone 3): the work is branch-only, activates
nothing, and `goods_collections` stays ungranted, so if the re-review changed the
schema, the server layer above it is what moved.

That call was defensible, and it left four milestones of real product surface
with no gate over them, on a branch whose merge is a production deployment. Gate
C was opened to cover exactly that set. It came back clean.

## Provenance, and what this artifact is NOT

**Read this before citing this document as authority.**

This artifact was written on 2026-07-29 by the docs and record-integrity role,
**after** the review, to give a deploy-authorising gate a durable record. It had
none: the verdict existed only in session context, in `201fbfc`'s commit message
("Gate C clean over the previously unreviewed milestones 3-6") and in one line of
`docs/roadmap.md`.

**The docs role did not perform this review and did not re-execute its evidence.**
What follows is: (a) the verdict as recorded, sourced; (b) the scope, verified
against `git` by the docs role; (c) the design decisions in scope, transcribed
from the running log and the commits, each of which the docs role verified
corresponds to code that exists. It is **not** an independent re-derivation of
the verdict.

**Honest limitation, stated rather than papered over.** A "clean" verdict is the
weakest kind of review record to reconstruct after the fact, because clean
reviews produce no findings and therefore no artifacts. Gate A's record is strong
precisely because it went to CHANGES REQUIRED twice and left a trail of red runs.
Gate C's record is a verdict plus a scope. If a later reader needs to know
whether a specific behaviour in milestones 3-6 was actually examined, this
document cannot settle it, and should not be read as if it could.

**A verdict is not a substitute for evidence on temporal claims.** Per the rule
this session produced: a claim needs behavioural evidence when its truth depends
on a SEQUENCE or a STATE TRANSITION. The clearest illustration is inside this
gate's own scope. Milestone 3 shipped `deleteCollectionCore`'s eligibility rule,
Gate C passed it, and the **TOCTOU in that exact code was found afterwards, by a
different role, by trying to refute it** (see "What this gate did not catch").
Gate C being clean did not make the delete path safe, and nothing in this
document should be read as claiming it did.

## Scope, verified against git

`git log --oneline origin/master..HEAD` at `32a15e8`:

| Milestone | Commit | Surface |
|---|---|---|
| 3 — server behaviour | `8554e63` | `feat(collections): many-to-many server behaviour, archive lifecycle, flat-shop fallback` |
| 4 — Hub block | `25dda4f` | `feat(hub): featured-collection block, web + native` |
| 5 — native management | `caa1be1` | `feat(collections): native collection management` |
| 6 — docs / registry | `a261347` | `docs(p5d): correct the registry and build-plan rows the rebuild made false` |

## What was in scope, by milestone

Transcribed from `plus-build-progress.md` and the commits. Each item below was
checked by the docs role to correspond to code that exists at `32a15e8`; the
checks are `grep`-level existence checks, not behavioural verification.

**Milestone 3, server behaviour.** The shared model became many-to-many:
`groupProductsByCollection` takes `(products, collections, memberships)` and the
product no longer carries its own `collectionId`. `MAX_COLLECTIONS = 20` removed
per founder decision (it was enforced on create, so an artist organising a large
catalogue hit a wall mid-task). Sparse updates, so toggling visibility can no
longer reset the name. Archive / restore / eligible-delete: archive preserves
membership and per-collection ordering so restore returns the section whole, and
delete is refused on a populated LIVE collection because arranging work has no
undo. Entitlement and the kill switch moved onto the **public read**
(`publicCollectionsForArtist`), so a lapse to Free flattens the shop rather than
leaving it grouped: empty arrays are exactly the flat shop, and a downgrade must
never remove a purchasable product. 25 unit tests, 36 DB tests.

**Milestone 4, the `featured_collection` Hub block.** A third block family, and
the rules follow from that: the existing two are content blocks (which carry
their own text) and feature blocks (content-free, capped at one each). This one
carries a REFERENCE. The parser drops a block naming nothing, but deliberately
does **not** resolve the reference, because the parser is pure and has no
database, and dropping on a failed lookup would let a transient read error
silently delete the artist's saved block. The renderer drops a dangling reference
instead. Deduped by `collectionId` rather than capped at one. Rendering goes
through `publicCollectionsForArtist`, so entitlement, the kill switch and the
visible/archived filter are the shop's rules rather than a second copy.

**Milestone 5, native collection management.** `(tabs)/goods/collections` plus
GET/POST/PATCH/DELETE `/api/mobile/goods/collections`. Every write calls the same
cores the web actions call, per the one-source-of-truth rule. Five state-changing
operations share one PATCH route discriminated by `op`; an unknown `op` is
refused with 400, so a newer app calling an older deployment gets a clear error
instead of a silent no-op. Status mapping is deliberate: 403 for `not_entitled`
(the app maps it to IAP-safe copy via `plan-errors.ts`), 409 for `not_eligible`,
because a delete refused for having products in it is a state conflict, not a
malformed request. One deliberate web/native difference, recorded in the parity
register rather than left implicit: web can drag to reorder, the app cannot.

**Milestone 6, docs and registry.** The `goods_collections` registry row had gone
false in two ways: it named `setProductCollectionCore`, a core that no longer
exists, and it claimed the public grouping "is a pure shared function and needs no
gate of its own" — true of the function, wrong about the feature, since without a
gate on the READ an artist who lapsed to Free kept a grouped public shop.

## What this gate did **not** catch, and why that is on the record here

Stated so nobody reads "Gate C clean" as "milestones 3-6 are correct".

1. **The `deleteCollectionCore` TOCTOU.** Milestone 3's delete-eligibility rule
   read the membership count and then deleted in a **separate round trip**: no
   transaction, no lock, no re-check at delete time. Gate C did not catch it. It
   was found afterwards by a different role, and `0124` was written for it. The
   TOCTOU is **still open**: `0124` does not close it, and was reproduced three
   times independently. See `plus-build-progress.md`, "`0124` and the TOCTOU it
   does NOT close".
2. **Fail-flat was accidental, not deliberate.** Milestone 3's flat-shop fallback
   worked because `rawCollections ?? []` turns a null-on-error into an empty
   array that happens to render identically to the intended output. Same output,
   no guarantee. Task #22 converted 2 of 7 reads in `collections.ts`; it is not
   closed, and `listCollectionsForArtist` still discards both its errors, which
   forces `productCount` to 0 and mis-enables the delete button on a populated
   collection.
3. **The wire hazard was found in build, not in review.** Milestone 4's new block
   TYPE is not additive the way a new field is: the native editor read
   `BIO_BLOCK_META[block.type].label`, and an installed build carries its own
   compiled copy of that map, so a type added later resolves to `undefined` and
   dereferencing it crashes the Link Hub screen. A fallback now protects future
   block types, but builds already installed cannot be repaired from the server.
   See `docs/web-native-parity.md`, "Wire hazard".
4. **`0124` itself is outside this gate.** It was written after Gate C closed.
5. **Test coverage of the delete path is zero.** No test exercises
   `deleteCollectionCore` at all, before or after `0124`.

## What a clean Gate C does and does not authorise

- It **does** mean milestones 3-6 are no longer unreviewed surface, which is the
  hole it was opened to close.
- It **does not** authorise a merge. Merging is deploying: production is
  git-tracked from `master` and `master` is unprotected. `0121`, `0122` and
  `0124` must be applied from the branch and **catalog-verified** before the
  merge, and `0123` must not be re-applied because it is already live
  (`add324a`). Full constraint in `plus-build-progress.md` and `docs/roadmap.md`
  §1.
- It **does not** authorise granting `goods_collections`. A fresh EAS build is a
  hard prerequisite, per the wire hazard above.
