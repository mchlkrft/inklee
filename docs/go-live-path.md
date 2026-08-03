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

### Step 2 — Apply migrations 0125-0153 to production (precondition: step 1 ✅; needs the founder's go)

Migration-first, before any push. The release sequencer owns this. Nothing in
0125-0149 is reachable from deployed code today, so applying them cannot break
what is live; deploying the code first WOULD.

### Step 3 — Push master (precondition: step 2 complete and verified)

240 commits after the reconciliation. Everything stays dark: `consumer_sales_launch_approved` is
unrecorded and `GOODS_COMMERCE_ENABLED` is unset, so no commercial surface
turns on by pushing. Suggested belt-and-braces: run `pnpm check:imports` and
`pnpm audit:check` first. The former exists because master has shipped a commit
that could not build its own imports three times.

### Step 4 — Close the three DPIA gate keys — the work is BUILT; recording is the founder's

The LO-5 DPIA is **COMPLETE AND SIGNED** (2026-08-03). It needs no date and no
further counsel round. **As of the same-day reconciliation everything it gates
is BUILT and merged; no key is recorded, deliberately:**

| Key | State | Task |
| --- | --- | --- |
| `dpia_r3_direct_upload_attestation_built` | BUILT + merged (attestation on all three ingest paths, web and native) | #74 ✅ |
| `dpia_r4_signed_gallery_urls_built` | BUILT + merged (private bucket 0151, signed 15-min URLs, real-stack tested) | #75 ✅ |
| `dpia_r6_intake_retention_purge_built` | BUILT + merged (0152, rows AND storage objects, event-anchored) | #75 ✅ |
| `dpia_r1_notice_and_action_built` | ADDED per round-5 §4.2 (R1 had no key); the Q16 work behind it is UNBUILT (#79) | #79 ⬜ |

Enforced by `apps/web/src/lib/server/billing/dpia-gate-preconditions.ts`, which
throws while a key is absent and is deliberately NOT a test-mode no-op. Founder
target: **Wednesday 2026-08-05**. Do not record a key for work you did
yourself; re-verify "the capability was never granted" against production
immediately before recording R3/R4 (the merges relied on the DPIA's statement
of it).

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

## 3. Two founder decisions, open since 2026-08-03

Neither has been answered. Both were put and left deliberately unanswered rather
than assumed.

1. **Push the Connect code-half fix** (`40687c93`, on master). Stops
   `persistConnectAccountFromEvent` swallowing its lookup error behind an HTTP
   200, and adds Sentry to two payouts paths that fail silently. Mutation-
   verified. Under the sequence above this rides along with step 3.
2. **Enable connected-account delivery on the Stripe webhook endpoint.** This
   is the ONLY real fix for `account.updated`, and it is **Stripe
   configuration, not code**, so no deploy delivers it. Verified by CLI:
   `account.updated` events exist on the connected account
   (`evt_1U0Ff4H3gYinii8EQ65JwqDX`) and there are **zero** on the platform
   account, while both live endpoints are platform-only. Under destination
   charges the PaymentIntent lives on the platform account, which is exactly why
   `payment_intent.succeeded` lands and a connected-account event does not.
   Both Connect checkboxes in `docs/ot-12-rollout-runbook.md` are still
   unticked, and every setup doc lists event NAMES only, never the toggle.

Order matters: fixing delivery WITHOUT (1) would restore the events and then
swallow any lookup failure behind a 200.

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
