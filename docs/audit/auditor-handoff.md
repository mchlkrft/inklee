<!-- GENERATED FILE - DO NOT EDIT.
     Source of truth: docs/audit/findings.yaml
     Regenerate:      pnpm audit:generate
     Edits here are overwritten and will fail `pnpm audit:check` in CI. -->

# Independent auditor handoff

**Ledger content hash:** `0d1ac9945e4e`  (sha256 of findings.yaml, first 12; deliberately not a clock or a git commit, see scripts/audit/generate.cjs)

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
- **PAT-003** (systemic, confidence high): A PostgREST error is discarded, so a transient failure is indistinguishable from a legitimate empty result. Findings: PAY-DEP-001, WHK-ERR-001, CRON-CLN-001, CRON-PRG-001, CRON-CCH-001.
- **PAT-004** (systemic, confidence confirmed): A database read whose error is never bound, degrading silently to a plausible empty value that the caller then acts on. Findings: FEE-DSP-002, BDEL-PAY-002, PAY-RFD-011, GOODS-SET-001, GAL-REL-001, AUTH-MFA-001.

## Highest-priority sampling areas

1. Any area a pattern above marks `systemic` or `likely-systemic`: sample siblings the register does NOT list.
2. Unverified critical and high findings (below).
3. Areas with coverage `none` (below), especially where they neighbour a recorded finding.

| ID | Sev | Verification | Independent | Title |
| --- | --- | --- | --- | --- |
| AUTH-RPC-001 | critical | not-started | false | book_flash_item and increment_fee_sponsored_used were callable by anon via PostgREST until 0060 revoked the grants |
| PAY-DEP-001 | critical | not-started | false | A Stripe failure silently converted a card deposit into a manual one, producing a booking with no pay button; the first fix re-opened the same silent degradation |
| ABUSE-PUB-001 | high | not-started | false | The public project intake server action has none of the five abuse controls its direct sibling, the public booking intake, applies — no honeypot, no origin check, no rate limit, no image MIME allowlist and no dedupe |
| AUTH-EML-001 | high | passed | true | The Supabase Send Email Hook never sent the new-address confirmation on a secure email change, so no user could complete an email change |
| AUTH-MFA-001 | high | not-started | true | The MFA step-up gate fails OPEN on a transient failure, in production, and the page it redirects to fails open in the same direction |
| AUTH-RLS-001 | high | passed | true | product_collections shipped RLS-enabled with a SELECT-only policy while every write runs on the user-scoped client |
| AUTH-RLS-002 | high | passed | true | discount_codes had the identical SELECT-only RLS defect, live in production on the revenue path, from 0118 until 2026-07-29 |
| AUTH-RLS-003 | high | not-started | false | product_collections RLS DELETE policy allows artists to bypass delete_collection_if_eligible safety check, cascade-deleting populated collection items |
| BDEL-PAY-001 | high | not-started | false | Account deletion does not archive or pseudonymize P9 appointment payment data before the cascade destroys it |
| BDEL-PAY-002 | high | not-started | false | Account deletion's deposit read discarded its error, so a transient read failure let deletion proceed as though the artist had no deposits at all |
| BDEL-RET-001 | high | not-started | false | Terms and Privacy promise post-deletion retention of billing and tax records that the cascade destroys, and the retained archive has no field for any of them |
| BDEL-SUB-001 | high | not-started | false | Confirms and extends BILL-ENT-002: deletion never touches the subscription, and the cascade is now empirically shown to destroy billing_subscriptions and billing_consent_records |
| BDEL-TTS-001 | high | not-started | false | An append-only trigger on transaction_tax_snapshots aborts the profiles cascade, so account deletion fails permanently after irreversibly cancelling the client's deposit PaymentIntents |
| BILL-ENT-002 | high | not-started | false | OPEN: account deletion cancels PaymentIntents but never the subscription, and all nine billing/tax tables cascade-delete with the profile |
| CRON-CLN-001 | high | not-started | false | cleanup discards the error from the 7-year financial-retention lookup, so a transient failure deletes bookings carrying financial records |
| CRON-RMD-001 | high | not-started | false | Deposit-overdue reminder re-sends to the same customer every day forever; one production recipient has received 46 |
| DATA-MIG-001 | high | not-started | false | `migration repair --status applied` on 2026-04-20 marked 0001_rls_policies.sql applied without running it, leaving 6 core tables with RLS disabled in production for ~3 weeks |
| DATA-RACE-001 | high | passed | true | READ COMMITTED single-statement snapshots defeated two separate safety mechanisms, each shipped with a written claim of atomicity that had never been executed |
| DRIFT-ENUM-001 | high | passed | true | Production's order_status enum holds a mangled label `cancel\r\n  led` instead of `cancelled`, so 'cancelled'::order_status is not a valid value in production |
| GAL-REL-001 | high | not-started | true | The C1.5 gallery relocation control silently and PERMANENTLY self-disables on a transient read failure, leaving client photographs public |
| GOODS-SET-001 | high | not-started | true | A discarded read in a read-modify-write DESTROYS the artist's entire settings blob, and being a write it does not self-heal |
| PAY-AUTHZ-001 | high | not-started | true | refundDepositCore refunded whatever PaymentIntent the booking row named, without ever checking the intent belonged to the caller - and the pattern is LIVE ON PRODUCTION |
| PAY-AUTHZ-002 | high | not-started | true | refundGoodsOrderCore had the same defect, and the attacker authors the order_items the refund amount is computed from |
| PAY-BAL-001 | high | not-started | false | deposit and balance payment requests have no subject-scoped ceiling because the stored final service price is null in production |
| PAY-CONN-001 | high | not-started | false | Cached Connect state asserted a routing capability Stripe denied, and the first corrective predicate was broad enough to downgrade the entire artist fleet on one platform-scope fault |
| PAY-CONN-002 | high | not-started | false | Custom Connect requirement/restriction reminders reach the platform inbox, never the artist |
| PAY-FEE-002 | high | not-started | false | The appointment platform fee was computed on the whole frozen basket while the charge was the remainder, so a partial collection was charged the fee twice and could exceed the amount |
| PAY-ORD-001 | high | not-started | false | The refund ordering guard compares a second-granularity clock with a strict `<`, so a stale `charge.refunded` created in the same second as the newest one is applied and walks the recorded refund backwards |
| PAY-ORD-002 | high | not-started | false | A `payment_intent.succeeded` cannot move a request out of `failed`, so a collection recorded after a payment_failed on the same intent leaves the request permanently `failed` with the money already allocated, and says nothing |
| PAY-RFD-001 | high | not-started | false | A fully refunded appointment payment request still reads `paid`: the refund converges the money and never moves the request's status |
| PAY-RFD-002 | high | pending | false | Fee refund policy v1 'retain non-recoverable' retains the whole platform fee, not the actual Stripe cost |
| PAY-RFD-011 | high | not-started | true | The refund path cannot tell a failed payment_collections read from an absent row, and the fallback can retain processor cost from the buyer twice |
| PAY-RLS-005 | high | not-started | false | 0128 anon SELECT policies expose every sent payment request via the anon key |
| PAY-SPON-001 | high | not-started | false | Sponsorship waivers were released against PaymentIntent metadata (intent) rather than what settlement actually booked, erasing other bookings' real cap usage; and the first webhook release added a delta instead of converging to a target |
| PAY-WHK-001 | high | not-started | false | A P9 appointment-payment intent reaching the deposit webhook answers 409, which is a failed delivery that would push Stripe toward disabling the endpoint every real deposit settles on |
| SHOP-ORD-002 | high | passed | true | The 24h stale-order sweep cancels the ORDER but leaves the PaymentIntent live and payable: a buyer paying after the sweep is charged with no order, no inventory, no receipt and no artist visibility |
| TEST-VAC-001 | high | passed | true | Tests incapable of failing, found in at least five independent rounds, including the suite written specifically to prove an RLS repair |
| WEB-XSS-001 | high | not-started | true | Stored XSS on the public /studios/[slug] page: JSON-LD emitted with raw JSON.stringify into dangerouslySetInnerHTML, bypassing the repo's own escaper |
| WHK-COLL-001 | high | not-started | false | P9 appointment-payment intents stamp metadata.booking_id into the same payment_intent.succeeded stream the deposit webhook claims, and the deposit webhook has no discriminator |
| WHK-ERR-001 | high | not-started | false | 17 of 23 Supabase calls in the deposit webhook discard the error, and the handler then returns HTTP 200, so Stripe never redelivers and the skipped money work is permanently lost |
| WHK-TOK-001 | high | not-started | false | The customer's magic-link token is rotated inside the atomic settlement flip, then delivered by an email path that swallows every error and can never be retried |

## Areas NOT reviewed

Nothing here has been inspected. No inference about their condition is available from this register.

| Area | Subsystem | Recommended inspection |
| --- | --- | --- |
| Background jobs and crons | jobs | Run a one-sided production listing of cron.job (jobname, schedule, active, command hash) and commit it as an expected-state file, since there is no local counterpart to diff against. |
| Dependency security | secops | Enable Dependabot or an OSV/pnpm-audit CI step; re-run and triage today's advisories for both apps/web and apps/mobile. |
| Mobile client (Expo app) | mobile | At minimum a shared-contract test suite over @inklee/shared wire types the app switches on or indexes by; then a smoke suite (Maestro/Detox) for the 5 launch-critical screens. The on-device sweep is already an open launch blocker. |
| Payments | Stripe webhook endpoint event subscription (Dashboard-side configuration) | Read-only GET https://api.stripe.com/v1/webhook_endpoints in both modes. Compare against the handler's branch list (account.updated, account.application.deauthorized, charge.refunded, charge.dispute.*, payment_intent.payment_failed, payment_intent.succeeded) and record the delta in the register. Then consider asserting the set in code or CI so a handler cannot ship unreachable again. |
| Production configuration | platform | Extend schema-drift.cjs (or a sibling) to snapshot the read-only Management API config endpoints and diff them against a committed expected-config file. PostgREST's db-schemas and max-rows and GoTrue's JWT expiry are the highest-value three. |

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
