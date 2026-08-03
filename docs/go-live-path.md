# The go-live path

**Written 2026-08-03.** One ordered sequence from where the repository actually
is to consumer sales being live. Every position claim below was verified by
command against git, the production database or the Stripe API on that date,
and each says how. Where something could not be determined it says so instead
of guessing.

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

Known invisible work, as of 2026-08-03:

- **`wf-0150-tax-horizon`** (`a28dcf3d`) — counsel §7.4 fully implemented:
  migration `0150_tax_snapshot_horizon_all_accounts.sql` (427 lines), a
  `retention_legal_holds` table, `retention_legal_hold_active()`, and 561 lines
  of tests. **Unmerged. Conflicts with master** in
  `apps/web/tests/db/tax-ledger-purge.test.ts` and
  `docs/product/plus-build-time-decisions.md`. This is task #85, and it is
  BUILT, not open.
- **⚠️ It supersedes work committed to master on the same day.** Task #89's new
  trigger tests pin `artist_id is null` as a DELETE condition. Counsel §7.4
  overturns exactly that. When 0150 merges, the branch's
  `describe("tts_block_mutation: each DELETE condition, isolated")` block
  REPLACES master's; master's version must be deleted, not merged alongside.
- Other worktrees under `.claude/worktrees/` and siblings
  `A:\WORK\inklee-hotfix`, `-booking`, `-founding-artist-beta`,
  `-studios-guestspots-map` each carry their own state.

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

### Step 1 — Reconcile the invisible work (no precondition)

1. Verify `0150` the way `0147` was verified on 2026-08-03: apply locally,
   run its suite, then MUTATE each trigger condition one at a time and confirm
   each mutation reds a specific test. That protocol caught a real divergence
   in `0147`; this branch introduces a new table on a retention path and
   deserves it more.
2. Merge `wf-0150-tax-horizon`, taking the branch's trigger-test block WHOLESALE
   over master's. Master's asserts the pre-§7.4 rule.
3. Re-check every other unmerged branch from §0 for the same situation.

### Step 2 — Apply migrations 0125-0149 to production (precondition: step 1, so 0150 is in the same run)

Migration-first, before any push. The release sequencer owns this. Nothing in
0125-0149 is reachable from deployed code today, so applying them cannot break
what is live; deploying the code first WOULD.

### Step 3 — Push master (precondition: step 2 complete and verified)

223 commits. Everything stays dark: `consumer_sales_launch_approved` is
unrecorded and `GOODS_COMMERCE_ENABLED` is unset, so no commercial surface
turns on by pushing. Suggested belt-and-braces: run `pnpm check:imports` and
`pnpm audit:check` first. The former exists because master has shipped a commit
that could not build its own imports three times.

### Step 4 — Close the three DPIA gate keys (precondition: none; parallel to 1-3)

The LO-5 DPIA is **COMPLETE AND SIGNED** (2026-08-03). It needs no date and no
further counsel round. What it gates is unbuilt:

| Key | What must exist | Task |
| --- | --- | --- |
| `dpia_r3_direct_upload_attestation_built` | rights attestation on DIRECT upload, at parity with URL import | #74 |
| `dpia_r4_signed_gallery_urls_built` | signed expiring URLs, required BEFORE the capability is granted to anyone | #75 |
| `dpia_r6_intake_retention_purge_built` | the 90-day intake retention purge; gates BOTH gallery and goods | #75 |

Enforced by `apps/web/src/lib/server/billing/dpia-gate-preconditions.ts`, which
throws while a key is absent and is deliberately NOT a test-mode no-op. Founder
target: **Wednesday 2026-08-05**. Do not record a key for work you did
yourself.

### Step 5 — Build the answered-but-unbuilt counsel items (precondition: none)

These were mis-filed as open counsel questions. Counsel has ANSWERED all of
them; they are build work with a known specification. **Do not send them to
counsel again** — round 5 lists them under "Checked and NOT asking about" for
exactly that reason.

- **#85** — §7.4 horizon for live accounts. BUILT on `wf-0150-tax-horizon`, see step 1.
- **#86** — §7.5 Connect-balance retention: operator escalation plus a
  documented annual review. Check for a branch first.
- **#79** — Q16 gallery notice-and-action (four named elements) and Q20 P2B
  terms plus the DSA Section 4 recorded trigger.
- **#88** — the Q7 and Q12 Terms clauses into the C1.9 input package. CR4-2
  makes this procedural: a clause a permission is conditioned on enters the
  package in the SAME work item as the code.

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
- **#95** — before v2 activates, five marketing pages tell Free artists they can
  collect card deposits. At v2 the Free rate is `null`, not a number: they
  cannot use the lane at all. The fee NUMBER is now derived on all five; the
  availability FRAMING is not.
- **#94** — `tax-ledger-purge.test.ts` fails 9 of 12 on a developer machine from
  its own accumulated leftovers (814 rows, 208 corrections). Passes clean. A
  suite that rots on the machine of whoever runs it most is how a db suite stops
  being trusted.
- **#92** — see §3.

---

## 5. What could not be determined

- **Whether 0125-0127 were deliberately deployed ahead of their schema or by
  accident.** The effect is understood and currently harmless; the intent is
  not recorded anywhere found.
- **Whether `wf-0150-tax-horizon` was independently verified** by anyone before
  being left unmerged. Treat it as unverified.
- **Whether other unmerged branches contain finished work.** §0 lists where to
  look; only `wf-0150-tax-horizon` was examined in detail on 2026-08-03.
