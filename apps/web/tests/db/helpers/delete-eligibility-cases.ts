/**
 * THE delete-eligibility rule, stated once.
 *
 * The same rule is implemented twice, in two languages, in two repositories'
 * worth of distance from each other:
 *
 *   1. `canDeleteCollection()` in `packages/shared/src/collections.ts`
 *      (`memberCount === 0 || !!c.archivedAt`) decides what the UI offers.
 *   2. `delete_collection_if_eligible()` in migration
 *      `apps/web/supabase/migrations/0124_delete_collection_atomic.sql`
 *      (`archived_at is not null or not exists (...)`) decides what the
 *      database actually does.
 *
 * Nothing in the type system connects them. If (1) is loosened, the UI offers a
 * delete the database will refuse, and the artist gets an error on a button
 * that should not have been enabled. If (2) is loosened, the confirmation copy
 * ("archive it first") stops matching the outcome and populated collections get
 * destroyed by a path the UI still describes as safe. Either direction is
 * silent: every existing unit test passes, because they only ever exercised one
 * side.
 *
 * So both are driven from this table, in one test, in `collection-delete-rpc.
 * test.ts`. Drift in either implementation turns `pnpm test:db` red, and both
 * directions were executed on 2026-07-29 rather than reasoned about:
 * dropping the archive bypass from (1) reddens exactly "populated and
 * archived" on the TypeScript assertion; dropping the empty bypass from (2)
 * reddens exactly "empty and live" on the SQL assertion. Neither mutation can
 * be green on both sides, which is the property the table exists to create.
 *
 * NOT COVERED HERE, on purpose: the `gone` verdict. `canDeleteCollection` takes
 * a collection that exists, so "wrong id / another artist's id / already
 * deleted" has no counterpart on the TypeScript side and cannot be expressed as
 * agreement between the two. Those branches are tested separately in the same
 * file, under "identity is not leakable".
 *
 * See also `describe("canDeleteCollection")` in
 * `apps/web/src/lib/__tests__/collections.test.ts`. That block is the fast unit
 * check of implementation (1) alone; it is redundant coverage rather than a
 * second source of truth, because any change to (1) that contradicts this table
 * fails HERE regardless of what that block says. Executed: under the
 * archive-bypass mutation BOTH suites go red, so that block buys speed, not
 * safety. Under the SQL mutation only this one does, and that asymmetry is the
 * whole reason the table lives on this side. Pointing that block at this table
 * would make the cross-reference reciprocal; it sits outside `tests/db/` and
 * was deliberately not touched.
 */

export type DeleteEligibilityCase = {
  /** Used verbatim in the test name, so a red run names the branch. */
  readonly name: string;
  readonly memberCount: number;
  readonly archived: boolean;
  /** What `canDeleteCollection(collection, memberCount)` must return. */
  readonly canDelete: boolean;
  /** What `delete_collection_if_eligible(id, artistId)` must return. */
  readonly rpc: "deleted" | "not_eligible";
  /** Must the collection row still exist after the call? */
  readonly collectionSurvives: boolean;
  /** Why this row is what it is, in one line. */
  readonly rationale: string;
};

export const DELETE_ELIGIBILITY_CASES: readonly DeleteEligibilityCase[] = [
  {
    name: "empty and live",
    memberCount: 0,
    archived: false,
    canDelete: true,
    rpc: "deleted",
    collectionSurvives: false,
    rationale:
      "Nothing to lose. Forcing a mis-created section through archive would be pure ceremony.",
  },
  {
    name: "empty and archived",
    memberCount: 0,
    archived: true,
    canDelete: true,
    rpc: "deleted",
    collectionSurvives: false,
    rationale:
      "Both clauses of the rule agree here. Present so the table is the full 2x2 and cannot be narrowed unnoticed.",
  },
  {
    name: "populated and live",
    memberCount: 2,
    archived: false,
    canDelete: false,
    rpc: "not_eligible",
    collectionSurvives: true,
    rationale:
      "The one refusal. Membership and per-collection ordering are arranging work with no undo, so delete waits for a deliberate archive first.",
  },
  {
    name: "populated and archived",
    memberCount: 2,
    archived: true,
    canDelete: true,
    rpc: "deleted",
    collectionSurvives: false,
    rationale:
      "Archive is the deliberate first act; delete is the second. The cascade takes the membership, never the products.",
  },
] as const;
