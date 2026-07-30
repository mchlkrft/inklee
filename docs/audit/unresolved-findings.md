<!-- GENERATED FILE - DO NOT EDIT.
     Source of truth: docs/audit/findings.yaml
     Regenerate:      pnpm audit:generate
     Edits here are overwritten and will fail `pnpm audit:check` in CI. -->

# Unresolved findings

**Source commit:** `uncommitted` · **Ledger last changed:** uncommitted

Operational view. Generated from the ledger; do not edit.

## Open (5)

| ID | Sev | Domain | Reachability | Impact | Title |
| --- | --- | --- | --- | --- | --- |
| BILL-ENT-002 | high | billing | conditionally-reachable | latent | OPEN: account deletion cancels PaymentIntents but never the subscription, and all nine billing/tax tables cascade-delete with the profile |
| BILL-ENT-001 | medium | entitlement | directly-reachable | reachable-no-known-impact | OPEN: creating a live Stripe Connect account is gated on auth and rate limit but not on entitlement |
| OPS-TOOL-001 | medium | tooling | directly-reachable | actively-impacting | Ten governance scripts hardcode the absolute Windows path A:/WORK/inklee, so none can run in CI or on any other machine |
| COPY-UI-001 | low | web | directly-reachable | actively-impacting | Two em-dashes in user-visible checkout copy on the screen where a consumer commits to a recurring charge, plus a yearly option that renders only for a cohort that does not exist |
| OPS-LINT-001 | low | ci-cd | directly-reachable | actively-impacting | packages/shared is linted by nothing, so 'lint 0 errors' has always been vacuous for 78 files including all the money math |

## In progress (0)

_None._

## Fixed but NOT verified (5)

A commit exists. Nothing independent has confirmed it works.

| ID | Sev | Domain | Reachability | Impact | Title |
| --- | --- | --- | --- | --- | --- |
| PAY-DEP-001 | critical | payment | directly-reachable | historically-impacting | A Stripe failure silently converted a card deposit into a manual one, producing a booking with no pay button; the first fix re-opened the same silent degradation |
| DATA-MIG-001 | high | migration | directly-reachable | historically-impacting | `migration repair --status applied` on 2026-04-20 marked 0001_rls_policies.sql applied without running it, leaving 6 core tables with RLS disabled in production for ~3 weeks |
| PAY-CONN-001 | high | payment | directly-reachable | historically-impacting | Cached Connect state asserted a routing capability Stripe denied, and the first corrective predicate was broad enough to downgrade the entire artist fleet on one platform-scope fault |
| PAY-SPON-001 | high | payment | directly-reachable | historically-impacting | Sponsorship waivers were released against PaymentIntent metadata (intent) rather than what settlement actually booked, erasing other bookings' real cap usage; and the first webhook release added a delta instead of converging to a target |
| DATA-MIG-002 | medium | migration | conditionally-reachable | latent | 68 `create table if not exists` blocks declare constraints inline, so the documented non-convergence footgun is systemic — and the 0122 remediation that produced the footgun entry is itself partial |

## Verified, but NOT independently (0)

Verified by the same instance or process that produced the fix. Recorded as a limitation, not as assurance.

_None._

## Deferred (0)

_None._

## Risk accepted (0)

_None._

## Mitigated but not fixed (0)

_None._

## Verification blocked or impossible (0)

_None._

## Production reachability UNKNOWN (0)

Reachability was not established. These need production-state confirmation before they can be prioritized honestly.

_None._

