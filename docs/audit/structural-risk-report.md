<!-- GENERATED FILE - DO NOT EDIT.
     Source of truth: docs/audit/findings.yaml
     Regenerate:      pnpm audit:generate
     Edits here are overwritten and will fail `pnpm audit:check` in CI. -->

# Structural risk report

**Source commit:** `uncommitted` · **Ledger last changed:** uncommitted

> The ledger is not yet committed, so this report has no source commit.

> **This report is an evidence index and prioritization aid. It does not establish that
> unlisted areas are safe and does not replace an independent audit.**

## Executive summary

15 recorded finding(s), 2 structural pattern(s), across 34 mapped area(s).
10 remain open by remediation status. 14 are reachable (directly or conditionally) rather than latent.
10 have not passed independent verification.
36 analogous area(s) are flagged as plausibly affected but **not yet inspected**.

The register is deliberately incomplete. It records what has been examined, not what exists.

## Findings by severity

| Severity | Count |
| --- | --- |
| critical | 1 |
| high | 8 |
| medium | 4 |
| low | 2 |

## Findings by remediation status

| Status | Count |
| --- | --- |
| fixed-unverified | 5 |
| open | 5 |
| verified | 5 |

## Findings by verification status

| Verification | Count |
| --- | --- |
| not-started | 10 |
| passed | 5 |

A fix is not a verification. 0 finding(s) passed verification that was **not independent**.

## Active structural patterns

### PAT-001 — A safety property is asserted in a comment or commit message before it has ever been executed, and the assertion then suppresses the next reader's inspection

**Assessment:** systemic · **Confidence:** high · **Status:** active · **Recurrences:** 5

Across at least seven independent instances the repo shipped a written claim of correctness — 'atomic', 'idempotent', 'this sibling is fine', 'both locks cover this', 'converges' — where the property had never been executed against a running system. In every case the claim was found false only when someone tried to REFUTE it rather than read it. The repo has begun naming this itself: commit 675152b calls it 'a comment asserting a safety property that has not been executed tells the next reader not to look'.

**Shared root-cause hypothesis (a hypothesis, not a conclusion):** The repo's documentation culture is unusually strong — long, reasoned commit messages and heavily commented migrations — and that strength inverts into a hazard. A confident, well-argued comment is read as evidence. Nothing in the workflow distinguishes 'I reasoned this is true' from 'I executed this and observed it true', so the two are typographically identical in the artifact a future reader consults.

**Findings:** DATA-RACE-001, DATA-MIG-002, AUTH-RLS-001, AUTH-RLS-002, TEST-VAC-001

**Supporting evidence:**
- 9bb8d0a: 'Task #19 ... is NOT closed by this work, contrary to what the previous version of both comments asserted as fact. ... The claim was never executed. It is false.'
- f090956 A3: '0121's comment cited discount_codes as a healthy precedent. It is not. ... a wrong "this sibling is fine" is worse than no comment at all.'
- 0b42f2d: '0125 declared six constraints INLINE in create table if not exists, so they did not converge, while the header claimed they did.'
- 675152b: 'The file's docstring opened "TWO OBJECTS HOLD THIS, IN TWO DIFFERENT MIGRATIONS" ... That lock was removed in the same commit, so the header asserted a property the code no longer has.'
- AGENTS.md non-convergence footgun: 'Re-running had been certified idempotent on the basis that it does not error — which is a different property from converging to the intended schema.'
- docs/product/p5d-gate-c-review.md:49-56 generalises it: 'A verdict is not a substitute for evidence on temporal claims ... a claim needs behavioural evidence when its truth depends on a SEQUENCE or a STATE TRANSITION.'
- That same review document was created at 21458a0 (16:14:32) four minutes after 4d406f9 (16:10:10) fixed the defects it describes as open, and still says at :124-126 the TOCTOU 'is still open' and at :130-133 that listCollectionsForArtist 'still discards both its errors' — both false against apps/web/src/lib/server/collections.ts:407-409 and :426-430 on master. Ordering verified with `git merge-base --is-ancestor 4d406f9 21458a0` = YES.

**Evidence that limits this pattern:** The repo also produces the counter-example in quantity: 2035bf7's mutation-tested golden table, 4d406f9's named controls, 7d6773b's mutation against a deployed function body, and 0100's rolled-back-transaction verification are all executed evidence, correctly labelled. The pattern is therefore about an inconsistent standard rather than an absent one, and it appears to be actively correcting during the last week of the log.

**Comparable areas NOT yet inspected:**
- The ~45 migrations whose headers make correctness claims I did not test (0067, 0070, 0075, 0080, 0082, 0088, 0106 carry particularly long explanatory headers).
- docs/ contains roughly twenty one-off audit documents (security-audit-2026-06-10.md, payment-audit-2026-06-03.md and -06-05.md, mobile-audit-2026-06-08.md, mobile-audit-2-2026-06-08.md, launch-readiness-audit.md, web-functionality-audit-2026-06-11.md, analytics-audit-2026-05-14.md, flash-parity-audit-2026-07-04.md, mobile-web-audit-2026-06-18.md, admin-growth-cockpit-audit.md, me15-tablet-audit.md, branding-ui-audit.md, nav-auth-ui-audit-slice-61.md, seo-geo-audit-slice-1.md, phase-d-audit-2026-05-24.md, docs/ux-audit/) that I did NOT open. Each is a candidate carrier of the same defect: a verdict recorded without executed evidence, now cited as authority.

### PAT-002 — Independent adversarial verification is the only mechanism in this repo that has ever caught a defect in a fix, and on the money path it has caught one every ti

**Assessment:** systemic · **Confidence:** high · **Status:** active · **Recurrences:** 5

Every fix in the money path and the RLS repair that was subjected to a separate reviewing role came back with real defects — frequently including a re-introduction of the very bug being fixed. Where author-only-verified fixes were later re-examined, they were wrong. The claim is not 'reviews find things'; it is that in this repo the author-verified pass rate on money and permission fixes is close to zero.

**Shared root-cause hypothesis (a hypothesis, not a conclusion):** An author verifies against their own model of the system, and every one of these defects is a defect IN that model — a wrong belief about what READ COMMITTED guarantees, what a 403 means, what intent metadata proves, which client performs a write. A test written from a wrong model tests the wrong model. Only a second party operating from a different model probes the assumption itself.

**Findings:** PAY-DEP-001, PAY-SPON-001, TEST-VAC-001, AUTH-RLS-002, PAY-FEE-001

**Supporting evidence:**
- 0a25c66: 'Five real defects in the previous two commits, found by a 30-agent review of the money path' — including a re-opening of the exact silent degradation just fixed.
- bcb45d5: 'The review found two critical defects in the release I had just written.'
- f090956: 'The Gate A specialist review returned CHANGES REQUIRED and was correct on every finding. The most important one was not about this branch.' A2 was found 'by checking A3's claim instead of taking it'.
- 7679a0f: Gate A RE-review escalated again to CHANGES REQUIRED on two new HIGH findings, and a separate independent audit found the same shape in a third file 'not named in the review'.
- 0b42f2d: 'Nine defects were confirmed BY EXECUTION after the authors had declared the work green'; 3fce7be: 'NINE DEFECTS FOUND BY EXECUTION AFTER THE CODE WAS DECLARED GREEN'.
- 3fce7be's most pointed instance: the CRITICAL read-back defect was 'found in a fix the lead had just written by hand, after the lead had flagged exactly this risk in the verifier's brief and then not closed it.'

**Evidence that limits this pattern:** Three qualifications the register should carry. (1) The 'independent' verifiers are agent roles inside the same session, not separate people or separate time — weaker independence than the phrase implies. (2) The 2026-05-10 RLS incident had NO independent review at any point and its fixes have held for nearly three months, so author-only verification is not universally fatal. (3) 339bb72's 'anon REST count=0 on all 16 public tables' is author-run but is a genuine behavioural measurement, which suggests the load-bearing axis may be EXECUTED-vs-ARGUED rather than INDEPENDENT-vs-AUTHOR. I would record both axes separately and let evidence accumulate before collapsing them.

**Comparable areas NOT yet inspected:**
- Fixes that were author-verified and never independently re-examined: the entire 0026-0031 RLS incident response, and effectively all pre-2026-07 history. Absence of later findings there is absence of looking, not absence of defects.
- The ~20 unopened audit documents in docs/ would materially move this pattern's evidence base in either direction.


## Most affected domains

| Domain | Findings |
| --- | --- |
| payment | 4 |
| authorization | 2 |
| migration | 2 |
| billing | 1 |
| ci-cd | 1 |
| database | 1 |
| entitlement | 1 |
| testing | 1 |
| tooling | 1 |
| web | 1 |

## Findings with production reachability

| ID | Severity | Reachability | Impact | Title |
| --- | --- | --- | --- | --- |
| PAY-DEP-001 | critical | directly-reachable | historically-impacting | A Stripe failure silently converted a card deposit into a manual one, producing a booking with no pay button; the first fix re-opened the same silent degradation |
| AUTH-RLS-001 | high | directly-reachable | historically-impacting | product_collections shipped RLS-enabled with a SELECT-only policy while every write runs on the user-scoped client |
| AUTH-RLS-002 | high | directly-reachable | historically-impacting | discount_codes had the identical SELECT-only RLS defect, live in production on the revenue path, from 0118 until 2026-07-29 |
| BILL-ENT-002 | high | conditionally-reachable | latent | OPEN: account deletion cancels PaymentIntents but never the subscription, and all nine billing/tax tables cascade-delete with the profile |
| DATA-MIG-001 | high | directly-reachable | historically-impacting | `migration repair --status applied` on 2026-04-20 marked 0001_rls_policies.sql applied without running it, leaving 6 core tables with RLS disabled in production for ~3 weeks |
| DATA-RACE-001 | high | directly-reachable | reachable-no-known-impact | READ COMMITTED single-statement snapshots defeated two separate safety mechanisms, each shipped with a written claim of atomicity that had never been executed |
| PAY-CONN-001 | high | directly-reachable | historically-impacting | Cached Connect state asserted a routing capability Stripe denied, and the first corrective predicate was broad enough to downgrade the entire artist fleet on one platform-scope fault |
| PAY-SPON-001 | high | directly-reachable | historically-impacting | Sponsorship waivers were released against PaymentIntent metadata (intent) rather than what settlement actually booked, erasing other bookings' real cap usage; and the first webhook release added a delta instead of converging to a target |
| TEST-VAC-001 | high | directly-reachable | historically-impacting | Tests incapable of failing, found in at least five independent rounds, including the suite written specifically to prove an RLS repair |
| BILL-ENT-001 | medium | directly-reachable | reachable-no-known-impact | OPEN: creating a live Stripe Connect account is gated on auth and rate limit but not on entitlement |
| DATA-MIG-002 | medium | conditionally-reachable | latent | 68 `create table if not exists` blocks declare constraints inline, so the documented non-convergence footgun is systemic — and the 0122 remediation that produced the footgun entry is itself partial |
| OPS-TOOL-001 | medium | directly-reachable | actively-impacting | Ten governance scripts hardcode the absolute Windows path A:/WORK/inklee, so none can run in CI or on any other machine |
| COPY-UI-001 | low | directly-reachable | actively-impacting | Two em-dashes in user-visible checkout copy on the screen where a consumer commits to a recurring charge, plus a yearly option that renders only for a cohort that does not exist |
| OPS-LINT-001 | low | directly-reachable | actively-impacting | packages/shared is linted by nothing, so 'lint 0 errors' has always been vacuous for 78 files including all the money math |

## Findings awaiting verification

| ID | Severity | Remediation | Verification | Fix commit |
| --- | --- | --- | --- | --- |
| PAY-DEP-001 | critical | fixed-unverified | not-started | 7e59c79 |
| DATA-MIG-001 | high | fixed-unverified | not-started | 31f320c |
| PAY-CONN-001 | high | fixed-unverified | not-started | 7e59c79 |
| PAY-SPON-001 | high | fixed-unverified | not-started | edb99fb |
| DATA-MIG-002 | medium | fixed-unverified | not-started | 201fbfc |

## Analogous areas flagged but NOT inspected

These are the register's highest-value entries for an auditor: places a recorded weakness could plausibly also exist, where nobody has looked.

- /pricing's hardcoded yearly price (the other half of C2) was NOT read by me.
- 0115 (projects), 0116 (fee_actuals), 0117 (project_client_portal), 0119 (product_drops_preorders) were not policy-vs-client audited by me.
- 0118's SELECT policies carry no `TO` clause so they bind PUBLIC including anon; whether anon holds a table-level GRANT was NOT checked against a live catalog.
- Commit edb99fb (2026-07-21) records that 0095-0098 ALSO had to be repaired into the ledger because 'they had been applied by another session via direct SQL and were unrecorded' — a second, later ledger/reality divergence, in the safe direction. Whether other silent divergences exist was NOT checked against a live catalog.
- Every other table created since 0035 with `enable row level security` — I did not enumerate policy-vs-writing-client across the full table set.
- Fixes that were author-verified and never independently re-examined: the entire 0026-0031 RLS incident response, and effectively all pre-2026-07 history. Absence of later findings there is absence of looking, not absence of defects.
- I did NOT sweep the codebase for em-dashes in user-visible strings; I verified only the two the plan named. A repo-wide sweep of JSX string literals and apps/web/content/legal was NOT done.
- I did not check whether any of the 68 tables' inline constraints have actually diverged in production — that needs a live pg_constraint comparison I did not run.
- I scanned only `create table if not exists` blocks. Sibling non-convergent shapes were NOT scanned: `create index if not exists` where the definition later changed, `create policy` without a preceding `drop policy if exists`, `create trigger` guarded by existence rather than dropped and recreated.
- Migrations 0108, 0109 and 0110 add further billing objects; I confirmed only that they contain no `references profiles(id)` lines. Whether they create tables with other cascade paths to profiles was NOT checked.
- My grep excluded *.md but covered the whole tree; only scripts/ matched, so apps/ appears clean, but I did not separately audit apps/mobile config files.
- Other Sentry-capture-then-continue sites across the money path were not enumerated by me. Commit 3fce7be (2026-07-30) shows the class was still being found nine days later: 'the lost-claim read-back discarded its error ... the code CANCELLED AN INTENT A TWIN WAS COLLECTING ON'.
- Other cached external-state denormalisations on profiles (Instagram token state from 0061/0062, subscription status from 0106) were NOT audited by me for the same 'cache asserts a capability the external system denies' shape.
- Other constants duplicating a schedule/registry value and agreeing only under current configuration were NOT swept for. Candidates I did not check: cap values in packages/shared/src/entitlements.ts vs docs/product/pricing-model.md, and the capability-registry-vs-CAPABILITIES lockstep that docs/architecture/capability-registry.md:3-6 says is required.
- Other multi-statement read-then-write sequences in apps/web/src/lib/server/ were NOT enumerated by me. 'Read a count, then act on it in a separate round trip' is generic and I checked only collections and payment-requests.
- Other webhook handlers that mutate money-adjacent counters were not enumerated by me for the delta-vs-converge property. The AGENTS.md rule is general but I verified it only for the sponsorship release path.
- The 2374-test unit suite (count from 3fce7be) has NOT been mutation-tested as a whole. Only the 14 golden fee tests and a handful of db tests carry demonstrated kill evidence.
- The Playwright e2e suite was not examined by me for the same class.
- The accepted residual — 'a refund that is itself later reversed does not re-debit, since the ledger only converges upward' (bcb45d5) — is recorded as known and handled by hand. No tooling for it was inspected.
- The mobile app's copy was NOT swept.
- The mobile deposit route (apps/web/src/app/api/mobile/bookings/[id]/deposit/route.ts) was NOT inspected by me for the same degradation.
- The two mobile Connect routes named above — NOT inspected.
- The ~20 unopened audit documents in docs/ would materially move this pattern's evidence base in either direction.
- The ~45 migrations whose headers make correctness claims I did not test (0067, 0070, 0075, 0080, 0082, 0088, 0106 carry particularly long explanatory headers).
- Triggers elsewhere in the migration set that read a parent row without FOR UPDATE/FOR SHARE were NOT scanned.
- Whether anon can SELECT discount_codes: 0118's policies omit `TO authenticated` so they bind PUBLIC. Table-level GRANTs for anon were NOT checked against any catalog.
- Whether any OTHER Stripe-object-creating path lacks an entitlement gate (account-link creation, document upload from b5d33bf) — NOT inspected.
- Whether any of the other nine scripts is a required step in a runbook a second person would execute — I confirmed runbook status only for verify-legal-artifacts.cjs.
- Whether any of the six tables retained rows written during the gap window was not checked.
- Whether packages/shared is covered by prettier — lint-staged also runs `prettier --write` on *.{ts,tsx} and prettier has no base-path restriction, so formatting may be covered where linting is not. NOT verified.
- Whether the Terms actually promise retention of these specific records — I did NOT read apps/web/content/legal/terms.
- Whether vitest coverage includes packages/shared — commit 805358d notes the unit run 'globs src/** only', which suggests it may not. NOT verified.
- apps/web/src/lib/server/storage-purge.ts was NOT inspected for the same retention conflict.
- apps/web/tests/db/appointment-payments-rls.test.ts carries 68 assertions and was NOT inspected by me for the N1/N2 shapes (bare not.toBeNull, undestructured setup writes).
- docs/ contains roughly twenty one-off audit documents (security-audit-2026-06-10.md, payment-audit-2026-06-03.md and -06-05.md, mobile-audit-2026-06-08.md, mobile-audit-2-2026-06-08.md, launch-readiness-audit.md, web-functionality-audit-2026-06-11.md, analytics-audit-2026-05-14.md, flash-parity-audit-2026-07-04.md, mobile-web-audit-2026-06-18.md, admin-growth-cockpit-audit.md, me15-tablet-audit.md, branding-ui-audit.md, nav-auth-ui-audit-slice-61.md, seo-geo-audit-slice-1.md, phase-d-audit-2026-05-24.md, docs/ux-audit/) that I did NOT open. Each is a candidate carrier of the same defect: a verdict recorded without executed evidence, now cited as authority.
- packages/shared/src/order-fees.ts and fee-schedule.ts were not read in full by me; my evidence for the engine's current shape is order-fee-sync.ts plus commit messages.

## Recommended independent-auditor priorities

1. **PAT-001** (systemic): A safety property is asserted in a comment or commit message before it has ever been executed, and the assertion then suppresses the next reader's inspection
2. **PAT-002** (systemic): Independent adversarial verification is the only mechanism in this repo that has ever caught a defect in a fix, and on the money path it has caught one every ti
3. **PAY-DEP-001** (critical, unverified): A Stripe failure silently converted a card deposit into a manual one, producing a booking with no pay button; the first fix re-opened the same silent degradation
4. **BILL-ENT-002** (high, unverified): OPEN: account deletion cancels PaymentIntents but never the subscription, and all nine billing/tax tables cascade-delete with the profile
5. **DATA-MIG-001** (high, unverified): `migration repair --status applied` on 2026-04-20 marked 0001_rls_policies.sql applied without running it, leaving 6 core tables with RLS disabled in production for ~3 weeks
6. **PAY-CONN-001** (high, unverified): Cached Connect state asserted a routing capability Stripe denied, and the first corrective predicate was broad enough to downgrade the entire artist fleet on one platform-scope fault
7. **PAY-SPON-001** (high, unverified): Sponsorship waivers were released against PaymentIntent metadata (intent) rather than what settlement actually booked, erasing other bookings' real cap usage; and the first webhook release added a delta instead of converging to a target
8. **Uninspected**: Mobile client (Expo app) / mobile
9. **Uninspected**: Background jobs and crons / jobs
10. **Uninspected**: Storage access (Supabase buckets) / storage
11. **Uninspected**: Dependency security / secops
12. **Uninspected**: Production configuration / platform

## Limitations and confidence warnings

- Findings marked `hypothesis` or `low` confidence are **not established**. Root-cause hypotheses may be wrong.
- `currently-unreachable` reflects the system as inspected at the stated commit. Reachability changes with configuration, entitlement grants and deployment state.
- Coverage `none` means **not inspected**. It is never a safety claim.
- The database test suite runs against a LOCAL stack. Production schema drift is not covered by it.
- This repository is **public**. Some evidence is deliberately abbreviated; see each finding's `disclosure` block.
