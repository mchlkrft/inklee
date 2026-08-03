# Go-live execution plan (prepared 2026-08-03, evening)

**Written by the lead session for the NEXT session to execute.** This is a
runbook, not a discussion document. `docs/go-live-path.md` is the position and
ordering SoT; this file turns its steps into instructions with preconditions,
verification commands and stop conditions. Where the two disagree, STOP and
reconcile them before acting — do not pick one silently.

**Who does what.** Steps marked 🧑 FOUNDER are Michel's acts: you prepare and
verify, you never perform them. Steps marked ⚖️ COUNSEL wait on counsel's
answer. Everything else is engineering. **Never** record an approval key, push
to master, apply anything to production, flip a flag, or publish Terms without
the founder's explicit go IN THIS SESSION's conversation (a doc saying it is
planned is not a go).

---

## Standing rules for the executing session (read before Phase 0)

1. **Run the invisible-work check before building ANY item:**
   `git branch -a`, `git worktree list`, `git status --porcelain`. On
   2026-08-03 seven finished items were invisible; the mechanism (workflow
   worktrees + stopped sessions) is unchanged. The four sibling checkouts
   (`A:\WORK\inklee-hotfix`, `-booking`, `-founding-artist-beta`,
   `-studios-guestspots-map`) have NEVER been swept.
2. **Do not re-ask counsel anything answered.** Round-5 §7 lists what is
   settled. Round numbering is per-round (round-5 Q1 ≠ round-2 Q1).
3. **Migration discipline:** next free number is **0154**. Never reuse or
   renumber an applied migration. Every guard must be CONVERGENT
   (drop-then-create or per-item existence guards; never bare
   `... if not exists` for anything whose shape can change) — AGENTS.md has
   the full rule and the footguns. `0122` is the reference implementation.
4. **Every commit runs the full web build in the pre-commit hook (~5-10 min)
   when web/packages files are staged.** Plan commits accordingly; docs-only
   commits are fast. Never use `--no-verify`.
5. **Every review/verification updates `docs/audit/findings.yaml`** (findings
   with citations; a clean pass still writes a coverage row). Validate with
   `pnpm audit:validate`, regenerate with `pnpm audit:generate`. You do not
   verify your own fix; where independence is impossible, record
   `independent: false` with the limitation.
6. **Copy rules** for any user-visible string: no em-dashes, sentence case,
   Accept/Pass verbs, terminal punctuation on sentences. Search your diff for
   `—` before committing.
7. **Native-affecting changes update `docs/web-native-parity.md` in the same
   commit.** A new value in a union the app switches on is a BREAKING wire
   change; a new field is not.
8. **Local database:** migrated and bookkept through 0153, all suites green as
   of 2026-08-03 evening. `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres`;
   db suite runs via `pnpm test:db` in `apps/web` (env from `.env.e2e`).
9. **The repo is PUBLIC.** The untracked `docs/market-analysis/`,
   `scripts/market-analysis/`, the two zips and the two `*-chatgpt/` packs are
   deliberately uncommitted (internal traction data). Leave them unless the
   founder decides otherwise.
10. **If a step's verification fails, STOP that phase and report.** Do not
    improvise a repair path on production. Specifically never reach for
    `migration repair --status applied` or "re-run the migration" without
    reading the AGENTS.md footguns first.

---

## Phase 0 — Bootstrap and position check (every session start)

1. Read: `docs/go-live-path.md`, this file, `docs/product/go-live-worklist.md`.
2. Run the invisible-work check (standing rule 1).
3. Verify position (all must hold, else STOP and reconcile):

```bash
git log --oneline -3                      # tip should descend from 0b675384
git rev-list --count origin/master..master  # ~240 (grows only by new local work)
ls apps/web/supabase/migrations | tail -4   # 0150..0153, nothing new unexplained
pnpm check:imports && pnpm audit:check      # both green
```

4. Confirm production is still at 0124 applied / 0127 files before Phase A
   (queries in Phase A pre-flight).

---

## Phase A — Release: migrations 0125-0153 to production, then push master

**🧑 FOUNDER GO REQUIRED before anything in this phase touches production.**
Owner: the `inklee-release-sequencer` flow. Migration-first is NOT negotiable:
deployed code already contains modules referencing tables that do not exist in
prod (`payment_requests` family, latent only because no route reaches them);
pushing code first would widen that class, applying schema first cannot break
what is live.

### A1. Pre-flight (engineering, no founder needed)

- `pnpm check:imports`, `pnpm audit:check`, full unit suite
  (`cd apps/web && pnpm vitest run`), full db suite (`pnpm test:db`). All were
  green 2026-08-03 evening (3638 unit / 452 db); re-run, do not trust.
- Confirm prod position (Supabase Management API with
  `SUPABASE_ACCESS_TOKEN` from Windows env; direct psql is IPv6-unreachable):
  `select version from supabase_migrations.schema_migrations order by version desc limit 3;`
  → expect top = `0124`. If not, STOP.
- Read `docs/product/go-live-worklist.md` FA1 notes: **0140 must follow 0138**
  (natural file order satisfies this — verify nobody reordered), and 0144+0145
  were authored in parallel and have never run together in one isolated pass —
  do that rehearsal against a FRESH local db (`supabase db reset` in a scratch
  checkout is acceptable) before the production run if it has still never been
  done. Record the rehearsal as a coverage row.

### A2. Apply the batch (🧑 founder go, then release sequencer)

- **A2.0 — REPAIR THE ENUM FIRST (DRIFT-ENUM-001, hard gate, discovered 2026-08-03 pre-flight).**
  Production's `order_status` enum carries a mangled label `cancel\r\n  led`
  instead of `cancelled` (re-confirmed by live catalog read 2026-08-03).
  Migration `0149`'s backfill `update orders ... where status = 'cancelled'`
  coerces that literal to the enum at PLAN time and raises `22P02`, aborting the
  apply at 0149. Apply **`0154_repair_order_status_enum.sql` FIRST**, ahead of
  0125-0153 (it touches only the pre-existing type and depends on nothing in the
  batch). A naive `db push` reaches 0149 before 0154 and aborts, so the
  sequencer must apply and record 0154 first, then apply 0125-0153. After 0154,
  verify the label is clean:
  `select enumlabel, length(enumlabel) from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='order_status' order by enumsortorder;`
  → the third label must be exactly `cancelled` (length 9), no CR/LF. 0154 is
  proven by execution (`order-status-enum-repair.test.ts`, 7 tests) and is a
  convergent no-op if the label is already clean.
- **A2.1 — precheck gate: no duplicate `stripe_payment_intent_id`** before 0146
  builds its non-concurrent UNIQUE index:
  `select stripe_payment_intent_id, count(*) from orders where stripe_payment_intent_id is not null group by 1 having count(*) > 1;`
  → must return zero rows. Confirmed empty 2026-08-03 (prod `orders` has 1
  `pending` row total), but re-run at apply time.
- **A2.2 — apply 0125-0153** in filename order via the established Management API
  path, after A2.0 and A2.1 pass.
- **Catalog-verify after applying — exit 0 proves nothing** (AGENTS.md).
  Minimum checks, each against prod:
  - tables: `payment_requests`, `payment_request_lines`, `payment_collections`,
    `payment_allocations`, `shop_carts`, `retention_purge_runs`,
    `retention_legal_holds`, `connect_teardown_escalations`,
    `connect_teardown_escalation_reviews` in `pg_tables`.
  - functions: `purge_expired_tax_snapshots`, `retention_legal_hold_active`,
    `tts_block_mutation` in `pg_proc`.
  - trigger: `tts_no_mutation`, `ctesc_review_no_mutation`, and 0152's
    `closed_at` stamping trigger in `pg_trigger`.
  - index shape: `select indexdef from pg_indexes where indexname='deleted_account_records_connect_teardown_idx';`
    matches 0148's corrected definition.
  - storage: `select id, public from storage.buckets where id='gallery';` →
    `public = false`, and zero policies naming it.
  - RLS spot-check: `select tablename, policyname from pg_policies where tablename in ('retention_legal_holds','connect_teardown_escalations');`
    → RLS enabled, NO policies (service-role-only posture is policy-free with
    revokes, that is correct — absence of policies here is the design).
- Record the applied run + catalog evidence as an audit coverage row.

### A3. Push master (🧑 founder go)

- `git push origin master`. Everything stays dark:
  `consumer_sales_launch_approved` unrecorded, `GOODS_COMMERCE_ENABLED` unset.
- The #92 Connect code-half fix (`40687c93`) rides this push by design.
- Verify the Vercel deploy goes green and the deployed site serves (prod is a
  git deploy from master). Spot-check one public page and `/api/health`-class
  route if present; check Sentry for a spike in the first 30 minutes.

### A4. Stripe webhook config (🧑 FOUNDER, config not code)

Enable **connected-account event delivery** on the live Stripe webhook
endpoint (the only real fix for `account.updated`; evidence and event ids in
go-live-path §3). Do this AFTER A3 so the 40687c93 fix is live first — the
order matters: restoring delivery before the fix would swallow lookup failures
behind HTTP 200. Then tick both Connect checkboxes in
`docs/ot-12-rollout-runbook.md` and verify one `account.updated` arrives and
persists (Stripe CLI or dashboard delivery log + the profiles row updating).

---

## Phase B — Build #79: Q16 notice-and-action + the DSA §4 threshold trigger

The LAST answered-but-unbuilt counsel item. Spec is counsel round-2 Q16 (in
`docs/legal/counsel-handoff-2026-08-02.md` Part 5) and round-5 §4.1/§4.2.
Gate key `dpia_r1_notice_and_action_built` already guards the gallery gate;
this phase is what earns it. Worklist entry: **Q16-R1**.

### B1. The four Q16 elements (all four, none optional)

1. **Report category + surface links.** Add an "image of me without consent"
   category to `apps/web/src/app/legal/report/actions.ts` (categories list at
   :21-29) and its form; add a `/legal/report` link on the gallery-bearing
   surfaces (public hub gallery block, bio page). Copy rules apply.
2. **A queued moderation item + a removal action that removes the storage
   object.** Today the action only emails and acknowledges (:49-53). Build a
   moderation queue row (new table, migration **0154**, convergent guards,
   service-role-write posture — decide the read model deliberately per the
   RLS write-policy rule) and an admin action that (a) removes the gallery
   storage object, (b) updates the block JSON so no dangling reference
   remains, (c) records the DSA moderation statement via the existing
   `moderation_statements` writer.
3. **Gallery section in `docs/dsa-moderation-procedure.md`** (currently zero
   occurrences of "galler").
4. **Art. 16(5) acknowledgement** extended to the new category (likely free
   with element 1 — verify, do not assume).

Tests: unit tests for the action branch; a db test for the new table that can
FAIL (assert specific codes, service-role control); removal path proven
against real local storage (the R6/intake pattern in
`apps/web/tests/db/intake-retention-purge.test.ts` shows how). Parity
register: the report surfaces are web-only today — add the row with the
web-only decision recorded.

### B2. DSA §4 micro/small threshold row (migration 0155 or fold into 0154)

Add the micro/small-enterprise trigger to the threshold-monitoring table
(`0108` + `0145` family) alongside the VAT thresholds so one quarterly check
covers both, per round-2 Q20's answer: attach when exceeding micro/small under
Recommendation 2003/361, 12-month grace after crossing, designation changes
noted. Follow the 0145 row shape; wire into the existing threshold-warning
surface. Test like 0145's rows are tested.

### B3. Close-out

- Independent review (a different instance) of B1+B2 before merge; register
  rows for both.
- After merge + independent verification, tell the founder R1 is ready for key
  recording (Phase E) — do NOT record it.

---

## Phase C — Round-5 Q1 (the C5 empty-basket notice) ⚖️ COUNSEL

Blocked until counsel picks option (a), (b) or (c) from round-5 Q1. When the
answer arrives:

- **(a)** nothing to build.
- **(b)** suppress on empty basket + counsel's replacement wording for the
  C1.1 "(see below)" — implement exactly the wording given, verbatim rule.
- **(c)** derive the empty-state panel from the CATALOGUE's composition
  (`shop-checkout.tsx:149-151` area; `summarizeReturnDisclosure`), using
  counsel's approved shop-level wording for the mixed case. Add tests pinning
  all three catalogue compositions (all-custom, all-returnable, mixed).

Either way: unit tests, copy rules, and an entry in the C1.9 package if any
approved copy changed. This unblocks `GOODS_COMMERCE_ENABLED` (worklist FA12)
only in combination with the rest of the ladder.

---

## Phase D — #91: prove the 3% application fee live (🧑 FOUNDER, ~5 min)

Founder-run per FD14: disable sponsorship for the test artist, take one
EUR 1 card deposit, read `application_fee_amount` from the PaymentIntent
(expect 3 cents at 300 bps... at EUR 1.00 expect `3`), refund, re-enable
sponsorship. Record the observed intent id + amount in
`docs/product/plus-build-time-decisions.md` and close #91 in the register.
You prepare the exact commands/console steps; the founder executes.

---

## Phase E — Record the DPIA gate keys (🧑 FOUNDER)

Preconditions per key — all four exist in
`apps/web/src/lib/server/billing/dpia-gate-preconditions.ts`:

- R3/R4/R6: work is BUILT and merged (2026-08-03). Before recording, an
  INDEPENDENT verification pass (someone who did not build or merge them —
  note: the 2026-08-03 merges were reviewed and execution-tested, but the
  registry rows record which legs were not independently re-proven), plus a
  fresh prod query proving the gallery capability has never been granted to
  anyone (`rich_content_blocks` grants) — the wire-break and bucket-flip
  safety both rest on it.
- R1: only after Phase B is merged and independently verified.
- Recording: `scripts/billing/record-approval.cjs` per key, founder runs it.
  Never record a key for work you did yourself.

---

## Phase F — Assemble and submit the C1 package ⚖️ COUNSEL (one shot)

The ONE remaining counsel gate, open by design. Checklist:
`docs/legal/c1.9-terms-edit-inputs.md` "Execution checklist" (steps 1, 1b, 1c
now include the Q7/Q12 clauses and the P2B section — a version missing any of
them has not discharged its ruling) + the seven components listed in
`docs/product/plus-open-decisions-handoff.md`. Round-5 Q2-Q5 answers fold into
this same pass. Sequence: complete final drafts → single consolidated
confirmation pass on the rendered Terms → apply corrections → record approval
against the final versioned artifacts. **The as-deployed condition (worklist
FA7b) governs every key recording here**: release pushed, migrations applied,
C2 screenshot from the DEPLOYED surface first.

---

## Phase G — Activation ladder (🧑 FOUNDER, in order, each one-way)

Worklist Gate 5 order, unchanged: accountant price co-sign + fee/tax treatment
(A1/A3) → FA7b as-deployed condition satisfied → re-record engineering keys
(FA8) → C1.9 Terms version through the snapshot workflow + counsel confirm
(FA9) → record `consumer_sales_launch_approved` (FA10) → fee schedule v2 flip
(FA11 — note the #95 tests now make a wrong public page a red test) →
`GOODS_COMMERCE_ENABLED` (FA12, needs Phase C) → capability grants (gallery
needs ALL FOUR R-keys + a fresh EAS build, worklist FA3 — the R3 wire-break
makes the build a hard prerequisite). **Never activate on a provisional
decision entry.**

---

## Parking lot (do not silently drop, do not let them block the path)

- Operator surface for `recordEscalationReview` (#86 loose end, first needed
  ~2033; register row exists).
- `uploadProcessedGalleryFile` signing unit test (R4 gap, register row).
- DATA-MIG-004 verification close-out: one mutation of the `retained` CTE
  recursion arm to prove the 3-link test can fail.
- Worktree/branch cleanup after founder confirms nothing else is wanted from
  them: `.claude/worktrees/*` (all dispositioned), `wf-0150-tax-horizon`,
  `worktree-wf_b415a9e3-a43-{1,2,3}`, `merge/origin-master`,
  `backup/master-pre-origin-merge-20260803`.
- Sweep the four sibling checkouts for invisible work (never done).
- Market-analysis packs: founder decision on where they live.
- Round-3 §6-§7 counsel amendments (Art. 33(5) record, Q9 sibling record with
  the Stripe cross-reference, hosting-history lookup) — legal bookkeeping
  owed to counsel, independent of this path.
