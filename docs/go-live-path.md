# The go-live path

**Written 2026-08-03.** One ordered sequence from where the repository actually
is to consumer sales being live. Every position claim below was verified by
command against git, the production database or the Stripe API on that date,
and each says how. Where something could not be determined it says so instead
of guessing.

**Updated 2026-08-03, later the same day: §2 step 1 (reconcile the invisible
work) is COMPLETE.** All five invisible items landed on master, each behind an
independent review and post-merge execution: the 0150 tax horizon (#85,
mutation-verified five-for-five), the three DPIA gate-key builds (#74/#75:
R3 attestation, R4 private bucket + signed URLs with migration 0151, R6
intake purge with 0152), the #86 Connect-teardown escalation (renumbered to
0153), the §7.2 withdrawal-form suppression fix, and the main tree's own
uncommitted implementation/test halves. Positions in §1 are restated below
the original block. Steps 2-3 (apply 0125-0153 to production, then push) are
now the head of the path and both wait on the founder's go.

**Updated 2026-08-04: #79 (Q16 gallery notice-and-action) is BUILT, PUSHED,
and migration 0155 is APPLIED to production under explicit founder go.**
Prod is now at **0155** (was 0154). The apply was atomic (DDL + ledger in one
transaction) and post-apply verified object-by-object: `content_reports`
exists with RLS on and zero policies (service-role-only), the
`moderation_statements` target-type check now includes `gallery_image`,
`target_content_report_id` FK present, PostgREST cache reloaded (live REST
reads return 200).

**#79 is COMPLETE as of 2026-08-04.** Both independent-verify passes are done
(takedown CONFIRMED; intake->queue->admin SOUND), the one compliance finding
they raised (DSA-QUE-001, the best-effort queue write) was fixed load-bearing
in `b9f89a23` and independently verified closed by red-then-green (register
`verification.status: passed`, `independent: true`), and the gate key
`dpia_r1_notice_and_action_built` is RECORDED in prod
`billing_activation_approvals` (approved by "Management board (M. Kraeft)",
2026-08-04, verified read-back). Recording it opened NO gate: it is one of the
four gallery-gate keys and R3/R4/R6 remain absent (§4), with the capability
grant separate. The DSA Section 4 threshold row (B2) is deliberately NOT in
0155 and stays blocked on counsel round-6 Q1. Non-blocking follow-up: an ops
runbook for the rare content_reports insert-and-retry-both-fail case.

This file is the PATH. It is not a second source of truth for any decision:

| Question | Authoritative file |
| --- | --- |
| Is a gate open, what does it need | `docs/launch-gate.md` |
| Who must decide what, and has it been answered | `docs/product/plus-open-decisions-handoff.md` |
| What was decided and why (FD1-FD14, CR4-x) | `docs/product/plus-build-time-decisions.md` |
| What counsel was asked, this round | `docs/legal/counsel-handoff-round-5-2026-08-03.md` |
| What has been inspected, and what has not | `docs/audit/findings.yaml` |
| Web vs native parity | `docs/web-native-parity.md` |

---

## 0. Read this first: work exists that you cannot see

Five separate items were found on 2026-08-03 to be already complete but
invisible from the task list. One of them caused a real defect. **Before
building anything, run these three commands.**

```
git branch -a
git worktree list
git status --porcelain
```

Known invisible work, as of 2026-08-03 — **ALL RECONCILED later the same
day**; the list is kept because the protocol above only convinces when you can
see what it caught:

- **`wf-0150-tax-horizon`** (`a28dcf3d`) — counsel §7.4 fully implemented.
  **MERGED** (`c545efdf`) with the branch's trigger-test block replacing
  master's overturned one wholesale and the decisions log concatenated (both
  round-4 ruling sets kept). Verified by the 0147 protocol before the commit:
  five mutations, each redding exactly its pinning tests.
- **The three DPIA gate-key builds** sat COMMITTED but invisible in workflow
  worktrees: R3 attestation (`2a1c81d6`), R4 private bucket (`69f54d53`,
  migration 0151), R6 intake purge (`637a8aaa`, migration 0152). All three
  merged after independent review; the keys themselves stay unrecorded (the
  founder's act).
- **#86 Connect-teardown escalation** sat UNCOMMITTED in a third worktree with
  a migration number colliding with R4's. Renumbered 0151 -> 0153 and landed;
  its append-only trigger was proven able to fail and to converge.
- **The §7.2 withdrawal-form suppression fix** sat uncommitted in a fourth
  worktree while round-5 §4.3 described the remaining work to counsel as a
  comment-only fix. Execution disproved that (finding `DISC-FORM-001`); the
  fix landed (`162415ae`) and §4.3 was rewritten to report the correction.
- Sibling checkouts `A:\WORK\inklee-hotfix`, `-booking`,
  `-founding-artist-beta`, `-studios-guestspots-map` still carry their own
  state and were NOT part of this reconciliation.

Uncommitted does not mean unfinished here. On 2026-08-03 the working tree held
counsel's own rulings, a resolver that committed code already imported, and a
valid audit-register finding.

---

## 1. Where things actually are

**Verified by command, 2026-08-03.**

```
current branch          master
master vs origin/master 223 ahead, 0 behind     (git rev-list --left-right --count)
feat/p5d-collections    166 BEHIND master       (a stale backup ref, not the build)
migrations on master    through 0149
migration FILES in prod through 0127            (git ls-tree origin/master)
migrations APPLIED      through 0124            (supabase_migrations.schema_migrations)
```

**Restated after the same-day reconciliation** (verified by the same
commands):

```
migrations on master    through 0153            (0150-0153 landed this day)
master vs origin/master 240 ahead, 0 behind     (including this update's own commits)
prod positions          UNCHANGED (0127 files / 0124 applied) — nothing here
                        touched production
local dev database      migrated + bookkept through 0153, all suites green
```

**The roadmap's claim that the build lives on `feat/p5d-collections` is STALE.**
The build is on local `master`. That branch is 166 commits behind and is a
backup ref only.

### The three-way split that governs everything

Deployed code, applied schema and local work are at three different points:

- **0124** is what the production DATABASE has.
- **0127** is what the production CODE contains as migration files.
- **0149** is what master contains.

So `0125`, `0126` and `0127` are **deployed as code with no tables behind
them**. `payment_requests`, `payment_request_lines`, `payment_collections` and
`payment_allocations` do not exist in production (verified against `pg_tables`).

**This is LATENT, not live, and the distinction was checked rather than
assumed.** Three deployed modules query those tables
(`appointment-payment-intent.ts`, `appointment-payment-quote.ts`,
`appointment-payments.ts`), but **no route under `api/payments`,
`api/mobile/payments` or `bookings/payments` is deployed** (`git ls-tree
origin/master` returns nothing), and the deployed Stripe webhook never
references them (zero matches for `appointment-payment` or `payment_requests`
in `origin/master`'s `webhook/route.ts`). Nothing reachable in production can
hit a missing table today.

**It stops being latent the moment a payments route deploys.** That is why the
sequence below is migration-first and not negotiable.

---

## 2. The ordered path

Each step names its precondition. Steps 1-3 are mechanical. Step 4 onward
require decisions that are not engineering's to make.

### Step 1 — Reconcile the invisible work — ✅ DONE 2026-08-03

Executed as written. `0150` got the full mutation protocol (five mutations,
each redding exactly its pinning tests, restored green); the merge took the
branch's trigger-test block wholesale; every other worktree from §0 was
dispositioned (three DPIA merges, #86 landed renumbered, the §7.2 fix landed,
one worktree's remainder proved duplicated and was dropped). Register rows:
`DATA-MIG-004`, `DISC-FORM-001`, plus three coverage entries.

### Step 2 — Apply migrations 0125-0153 to production — ✅ DONE 2026-08-03

Executed under explicit founder go via the release-sequencer. The enum repair
(0154, DRIFT-ENUM-001) was applied FIRST and catalog-verified clean, then
0125-0153 in strict order, each atomic, catalog-verified object by object.
**Production DB is now at 0154; ledger holds 0125-0154 complete.** A blocker
the plan had missed was caught in pre-flight: 0149's `where status='cancelled'`
backfill would have aborted with 22P02 against production's mangled enum label;
0154 repaired it first. See execution-plan A2 and register DRIFT-ENUM-001.

### Step 3 — Push master — ✅ DONE 2026-08-03

Pushed fast-forward to `38d233c2` (0 behind). Everything stays dark:
`consumer_sales_launch_approved` unrecorded, `GOODS_COMMERCE_ENABLED` unset,
shop/store routes 404. Pre-push `check:imports` and `audit:check` were green.
Live site serves; PostgREST schema cache confirmed reloaded; the 0146
apply-before-push window closed by the deployed service-role markGoodsPickedUp
fix. Vercel build for `38d233c2` CONFIRMED promoted ("Ready", 2026-08-03).

### Step 4 — Close the three DPIA gate keys — the work is BUILT; recording is the founder's

The LO-5 DPIA is **COMPLETE AND SIGNED** (2026-08-03). It needs no date and no
further counsel round. **As of the same-day reconciliation everything it gates
is BUILT and merged; no key is recorded, deliberately:**

| Key | State | Task |
| --- | --- | --- |
| `dpia_r3_direct_upload_attestation_built` | BUILT + merged (attestation on all three ingest paths, web and native) | #74 ✅ |
| `dpia_r4_signed_gallery_urls_built` | BUILT + merged (private bucket 0151, signed 15-min URLs, real-stack tested) | #75 ✅ |
| `dpia_r6_intake_retention_purge_built` | BUILT + merged (0152, rows AND storage objects, event-anchored) | #75 ✅ |
| `dpia_r1_notice_and_action_built` | BUILT + **RECORDED in prod 2026-08-04** (approved_by "Management board (M. Kraeft)", both independent-verify passes done, DSA-QUE-001 fixed+verified) | #79 ✅ |

**Update 2026-08-04: dpia_r1 is now RECORDED (the first of the four).** R3/R4/R6
remain BUILT-but-unrecorded. Recording R1 opened no gate: the gallery gate needs
all four keys **and** the capability grant. So the remaining DPIA-key work is
recording R3/R4/R6.

`apps/web/src/lib/server/billing/dpia-gate-preconditions.ts` throws while a
key is absent and is deliberately NOT a test-mode no-op — but as of 2026-08-04
it has no caller anywhere in the live gallery path (register `DPIA-GAL-002`),
so recording a key is an attestation, not yet a technical gate on artist
access. The real enforcement for R3/R4 is the upload-path rights attestation
and the private gallery bucket + signed URLs, both independently verified.
Founder target: **Wednesday 2026-08-05**. Do not record a key for work you did
yourself.

**Re-verification done, 2026-08-04.** "The capability was never granted"
(the premise the R3/R4 merges relied on) is FALSE as literally worded: a
comp-Plus `account_overrides` grant (created 2026-06-05, before either merge)
holds the live `rich_content_blocks` entitlement, and `richContentBlocksAllowed`
evaluates true for it today. The narrower claim the DPIA's cost reasoning
actually needs — that the capability has never been **exercised** — is
independently confirmed: 0 gallery/gallery-archive objects, 0 `image_gallery`
blocks, re-queried directly against production. Recorded as `DPIA-GAL-001`.
Before recording R3/R4, the founder still needs to decide whether the comp
account (internal/test vs external artist) should carry `rich_content_blocks`
pre-launch.

### Step 5 — Build the answered-but-unbuilt counsel items (precondition: none)

These were mis-filed as open counsel questions. Counsel has ANSWERED all of
them; they are build work with a known specification. **Do not send them to
counsel again** — round 5 lists them under "Checked and NOT asking about" for
exactly that reason.

- **#85** — §7.4 horizon for live accounts. ✅ MERGED (step 1).
- **#86** — §7.5 Connect-balance retention escalation. ✅ MERGED (migration
  0153); the one loose end is an operator surface for
  `recordEscalationReview` (nothing product-side records the annual review
  yet; first escalation ~2033, tracked in the register).
- **#79** — the LAST answered-but-unbuilt item, now the top open build:
  Q16 gallery notice-and-action (four named elements, worklist entry Q16-R1,
  gate key `dpia_r1_notice_and_action_built` guards the gallery gate) and the
  Q20 DSA Section 4 micro/small threshold trigger row (schema work, next free
  migration number). The Q20 P2B TERMS half is drafted into the C1.9 package
  (2026-08-03) and rides the confirmation pass.
- **#88** — the Q7 and Q12 Terms clauses into the C1.9 input package. ✅ Both
  drafted and queued in the package (round-4 additions); round-5 Q2-Q4 ask
  counsel to ratify their riders in the same pass.

### Step 6 — The shop-on blocker (precondition: counsel answers C5)

**One thing blocks `GOODS_COMMERCE_ENABLED`:** counsel round-5 **Q1** (raised as
C5). The standalone shop's browse step prints the full 14-day return notice on
an EMPTY basket, which is the normal landing state, so an all-custom-made
artist's shop headline-promises a return right applying to nothing on sale.
Deliberately not fixed by engineering: the approved C1.1 seller block says
"see below", and suppressing the notice would strand approved copy. Three
options are drafted for counsel.

### Step 7 — Assemble and submit the C1 package (precondition: steps 4-6)

C1 is the ONE remaining counsel gate and is open BY DESIGN, not un-answered.
The founder rule is build → complete final drafts → submit the finished thing.
Checklist in `plus-open-decisions-handoff.md`; it has grown to seven components.

### Step 8 — Activate (precondition: everything above, plus the accountant)

In order: accountant price co-sign and fee/tax treatment (A1/A3) → record
`consumer_sales_launch_approved` → flip `GOODS_COMMERCE_ENABLED` → publish the
C1.9 Terms version. **Never activate on a provisional decision entry.**

---

## 3. Two Connect decisions — BOTH RESOLVED 2026-08-03

1. **Push the Connect code-half fix** (`40687c93`). ✅ DONE: it rode the A3
   push and is live on `origin/master`. Stops `persistConnectAccountFromEvent`
   swallowing its lookup error behind an HTTP 200, and adds Sentry to two
   payouts paths that failed silently.
2. **Deliver connected-account `account.updated`.** ✅ DONE, and the earlier
   "Stripe configuration, not code" framing was WRONG. The live
   `/api/stripe/webhook` was already subscribed to `account.updated`, but both
   endpoints were platform-only (`connect=false`), and Stripe makes `connect`
   IMMUTABLE, so the fix needed a NEW `connect=true` endpoint. That endpoint
   carries its own signing secret, and the route verified a single secret, so
   the events would fail signature verification: a CODE change, not a toggle.
   Delivered 2026-08-03: multi-secret verification (`50135c6f`, independently
   verified), a live `connect=true` endpoint `we_1U0OaPHkG0exykzFN4oqRVGg`, the
   secret in Vercel prod (`STRIPE_CONNECT_WEBHOOK_SECRET`) + the vault, and a
   live probe confirming the deployed app accepts a connect-secret-signed event
   (200) and rejects a bad one (400). See execution-plan A4.

The ordering constraint held: the code-half fix (1) was live before delivery
(2) was enabled, so no lookup failure is swallowed behind a 200.

---

## 4. Open, and blocking nothing

- **#91** — the 3% application fee has never been produced by live code.
  Sponsorship was on for G-5, so `application_fee_amount` was 0. De-gated by
  **FD14**, deliberately open. Closing it costs five minutes: disable
  sponsorship, take one EUR 1 deposit, read `application_fee_amount`.
- **#95** — ✅ RESOLVED 2026-08-03: `publicCardDepositCopy` derives the
  availability FRAMING too, byte-identical under v1 (test-pinned per surface),
  Plus-scoped under v2. FA11 now turns a wrong public page into a red test.
- **#94** — ✅ RESOLVED by the 0150 suite rewrite (self-cleaning afterAll,
  id-scoped assertions): 8 consecutive green runs on the machine carrying the
  866 accumulated rows that failed the old file.
- **#92** — see §3. Unchanged, both halves still the founder's.

---

## 5. What could not be determined

- **Whether 0125-0127 were deliberately deployed ahead of their schema or by
  accident.** The effect is understood and currently harmless; the intent is
  not recorded anywhere found.
- **Whether `wf-0150-tax-horizon` was independently verified** — RESOLVED
  later the same day: it was not, and then it was (independent line-level
  review plus the five-mutation execution pass, before the merge).
- **Whether other unmerged branches contain finished work** — RESOLVED for
  every worktree under `.claude/worktrees/` (all dispositioned). Still OPEN
  for the four sibling checkouts named in §0.
