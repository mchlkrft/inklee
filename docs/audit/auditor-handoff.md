<!-- GENERATED FILE - DO NOT EDIT.
     Source of truth: docs/audit/findings.yaml
     Regenerate:      pnpm audit:generate
     Edits here are overwritten and will fail `pnpm audit:check` in CI. -->

# Independent auditor handoff

**Source commit:** `uncommitted` · **Ledger last changed:** uncommitted

## What this system is

Inklee is a booking, payments and commerce platform for tattoo artists (Next.js + Supabase/Postgres, a React Native client, and Stripe including Connect).
This register is a running record of findings discovered during development and review. It exists so that evidence survives the session that produced it.

## Read this first

**Do not assume this register is complete.** It records what was examined. Most of the system has not been examined.

**Do not assume the root-cause hypotheses are correct.** They are labelled `root_cause_hypothesis` precisely because they are unproven. Several were wrong before and were corrected only when someone tried to disprove them by execution.

**Anchoring risk.** The most likely way this document harms an audit is by directing attention only where findings already exist. Treat the finding list as a sample of one team's attention, not a map of the risk surface. The `analogous_uninspected_areas` fields and the `none` rows in the scope map are deliberately the most actionable content here.

**Verify independently.** Every finding cites a file, symbol, migration or command. Re-run them. Where a finding says a fix was verified, check whether `verification.independent` is true; where it is false, the fix was confirmed by whoever wrote it.

## Source of truth

| File | Role |
| --- | --- |
| `docs/audit/findings.yaml` | The ledger. The ONLY hand-edited source. |
| `docs/audit/findings.schema.json` | Contract and controlled vocabulary. |
| `docs/audit/structural-risk-report.md` | Generated. Patterns and prioritization. |
| `docs/audit/audit-scope-map.md` | Generated. What has and has not been inspected. |
| `docs/audit/unresolved-findings.md` | Generated. Operational open state. |
| `docs/audit/evidence/` | Supporting artifacts, redacted for a public repository. |

Regenerate with `pnpm audit:generate`; validate with `pnpm audit:validate`.

## Structural patterns

- **PAT-001** (systemic, confidence high): A safety property is asserted in a comment or commit message before it has ever been executed, and the assertion then suppresses the next reader's inspection. Findings: DATA-RACE-001, DATA-MIG-002, AUTH-RLS-001, AUTH-RLS-002, TEST-VAC-001.
- **PAT-002** (systemic, confidence high): Independent adversarial verification is the only mechanism in this repo that has ever caught a defect in a fix, and on the money path it has caught one every ti. Findings: PAY-DEP-001, PAY-SPON-001, TEST-VAC-001, AUTH-RLS-002, PAY-FEE-001.

## Highest-priority sampling areas

1. Any area a pattern above marks `systemic` or `likely-systemic`: sample siblings the register does NOT list.
2. Unverified critical and high findings (below).
3. Areas with coverage `none` (below), especially where they neighbour a recorded finding.

| ID | Sev | Verification | Independent | Title |
| --- | --- | --- | --- | --- |
| PAY-DEP-001 | critical | not-started | false | A Stripe failure silently converted a card deposit into a manual one, producing a booking with no pay button; the first fix re-opened the same silent degradation |
| AUTH-RLS-001 | high | passed | true | product_collections shipped RLS-enabled with a SELECT-only policy while every write runs on the user-scoped client |
| AUTH-RLS-002 | high | passed | true | discount_codes had the identical SELECT-only RLS defect, live in production on the revenue path, from 0118 until 2026-07-29 |
| BILL-ENT-002 | high | not-started | false | OPEN: account deletion cancels PaymentIntents but never the subscription, and all nine billing/tax tables cascade-delete with the profile |
| DATA-MIG-001 | high | not-started | false | `migration repair --status applied` on 2026-04-20 marked 0001_rls_policies.sql applied without running it, leaving 6 core tables with RLS disabled in production for ~3 weeks |
| DATA-RACE-001 | high | passed | true | READ COMMITTED single-statement snapshots defeated two separate safety mechanisms, each shipped with a written claim of atomicity that had never been executed |
| PAY-CONN-001 | high | not-started | false | Cached Connect state asserted a routing capability Stripe denied, and the first corrective predicate was broad enough to downgrade the entire artist fleet on one platform-scope fault |
| PAY-SPON-001 | high | not-started | false | Sponsorship waivers were released against PaymentIntent metadata (intent) rather than what settlement actually booked, erasing other bookings' real cap usage; and the first webhook release added a delta instead of converging to a target |
| TEST-VAC-001 | high | passed | true | Tests incapable of failing, found in at least five independent rounds, including the suite written specifically to prove an RLS repair |

## Areas NOT reviewed

Nothing here has been inspected. No inference about their condition is available from this register.

| Area | Subsystem | Recommended inspection |
| --- | --- | --- |
| Background jobs and crons | jobs | Unauthorised-request test per cron endpoint; a dry-run/assertion test for cleanup and retention-purge covering the financial-retention carve-out the 2026-06-10 GDPR slice introduced. |
| Dependency security | secops | Enable Dependabot or an OSV/pnpm-audit CI step; re-run and triage today's advisories for both apps/web and apps/mobile. |
| Mobile client (Expo app) | mobile | At minimum a shared-contract test suite over @inklee/shared wire types the app switches on or indexes by; then a smoke suite (Maestro/Detox) for the 5 launch-critical screens. The on-device sweep is already an open launch blocker. |
| Production configuration | platform | A read-only production configuration inventory (env var NAMES only, no values) diffed against .env.example, plus the Supabase auth settings changed during the 2026-07-07 launch-gate work. |
| Storage access (Supabase buckets) | storage | Determine WHICH client writes to studio-media and welcome-pack-files (service-role vs user-scoped). A private bucket with zero policies is exactly the shape of the discount_codes/product_collections write-policy incident: a user-scoped write silently fails. Add a db test. |

## Known uncertainty

- The database test suite runs against a LOCAL Supabase stack only. **Production schema drift is caught by nothing automated.**
- Documentation in this repository has repeatedly been wrong about runtime behaviour. Prefer code and live catalog reads.
- Several findings were discovered only because an independent process tried to refute a claim that had already passed review. Absence of a finding in an area often means nobody tried that hard.
- This repository is **public**, so some evidence is abbreviated. Findings with `disclosure.public_repo_safe: false` point to where fuller evidence lives.

## Search beyond this register

Suggested independent starting points, chosen because they are where this register is weakest rather than strongest:

- Enumerate every table with RLS enabled and compare its policy set against which client actually writes it. Do not rely on the recorded findings to tell you which tables matter.
- Diff production database state against the migration history directly, rather than against the migration ledger table.
- Enumerate every entitlement gate and test it server-side by calling the core, not through the UI.
- Compare web and mobile implementations of the same business rule for divergence.
- For any test asserted as proof, delete the thing it protects and confirm it actually fails.
