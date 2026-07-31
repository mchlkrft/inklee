<!-- GENERATED FILE - DO NOT EDIT.
     Source of truth: docs/audit/findings.yaml
     Regenerate:      pnpm audit:generate
     Edits here are overwritten and will fail `pnpm audit:check` in CI. -->

# Unresolved findings

**Ledger content hash:** `ec29888f7517`  (sha256 of findings.yaml, first 12; deliberately not a clock or a git commit, see scripts/audit/generate.cjs)

Operational view. Generated from the ledger; do not edit.

## Open (60)

| ID | Sev | Domain | Reachability | Impact | Title |
| --- | --- | --- | --- | --- | --- |
| ABUSE-PUB-001 | high | public-surface | directly-reachable | latent | The public project intake server action has none of the five abuse controls its direct sibling, the public booking intake, applies — no honeypot, no origin check, no rate limit, no image MIME allowlist and no dedupe |
| AUTH-RLS-003 | high | authorization | directly-reachable | latent | product_collections RLS DELETE policy allows artists to bypass delete_collection_if_eligible safety check, cascade-deleting populated collection items |
| BDEL-PAY-001 | high | billing | directly-reachable | latent | Account deletion does not archive or pseudonymize P9 appointment payment data before the cascade destroys it |
| BDEL-RET-001 | high | data-retention | conditionally-reachable | latent | Terms and Privacy promise post-deletion retention of billing and tax records that the cascade destroys, and the retained archive has no field for any of them |
| BDEL-SUB-001 | high | billing | conditionally-reachable | latent | Confirms and extends BILL-ENT-002: deletion never touches the subscription, and the cascade is now empirically shown to destroy billing_subscriptions and billing_consent_records |
| BDEL-TTS-001 | high | billing | conditionally-reachable | latent | An append-only trigger on transaction_tax_snapshots aborts the profiles cascade, so account deletion fails permanently after irreversibly cancelling the client's deposit PaymentIntents |
| BILL-ENT-002 | high | billing | conditionally-reachable | latent | OPEN: account deletion cancels PaymentIntents but never the subscription, and all nine billing/tax tables cascade-delete with the profile |
| CRON-CLN-001 | high | jobs | conditionally-reachable | latent | cleanup discards the error from the 7-year financial-retention lookup, so a transient failure deletes bookings carrying financial records |
| CRON-RMD-001 | high | jobs | directly-reachable | actively-impacting | Deposit-overdue reminder re-sends to the same customer every day forever; one production recipient has received 46 |
| DRIFT-ENUM-001 | high | database | conditionally-reachable | latent | Production's order_status enum holds a mangled label `cancel\r\n  led` instead of `cancelled`, so 'cancelled'::order_status is not a valid value in production |
| PAY-ORD-001 | high | payment | conditionally-reachable | latent | The refund ordering guard compares a second-granularity clock with a strict `<`, so a stale `charge.refunded` created in the same second as the newest one is applied and walks the recorded refund backwards |
| PAY-ORD-002 | high | payment | conditionally-reachable | latent | A `payment_intent.succeeded` cannot move a request out of `failed`, so a collection recorded after a payment_failed on the same intent leaves the request permanently `failed` with the money already allocated, and says nothing |
| PAY-RFD-001 | high | payment | conditionally-reachable | latent | A fully refunded appointment payment request still reads `paid`: the refund converges the money and never moves the request's status |
| PAY-RFD-002 | high | payment | currently-unreachable | latent | Fee refund policy v1 'retain non-recoverable' retains the whole platform fee, not the actual Stripe cost |
| WHK-COLL-001 | high | webhook | currently-unreachable | latent | P9 appointment-payment intents stamp metadata.booking_id into the same payment_intent.succeeded stream the deposit webhook claims, and the deposit webhook has no discriminator |
| WHK-ERR-001 | high | webhook | directly-reachable | unknown | 17 of 23 Supabase calls in the deposit webhook discard the error, and the handler then returns HTTP 200, so Stripe never redelivers and the skipped money work is permanently lost |
| WHK-TOK-001 | high | webhook | directly-reachable | latent | The customer's magic-link token is rotated inside the atomic settlement flip, then delivered by an email path that swallows every error and can never be retried |
| BDEL-CON-001 | medium | billing | directly-reachable | latent | Counsel decision 7 on the Connected Account is half implemented: the pointer is retained but the scheduled account deletion at window-end was never built, and the pointer is purged at seven years |
| BILL-ENT-001 | medium | entitlement | directly-reachable | reachable-no-known-impact | OPEN: creating a live Stripe Connect account is gated on auth and rate limit but not on entitlement |
| CRON-CAP-001 | medium | jobs | conditionally-reachable | latent | The per-artist 10-email daily cap is consumed in branch order, and a capped appointment reminder is lost rather than deferred |
| CRON-COV-001 | medium | jobs | conditionally-reachable | unknown | coverage-worker has no run-level mutual exclusion and its real cadence comes from a GitHub Actions schedule against production, making overlap plausible for the non-task work |
| CRON-GRW-001 | medium | jobs | directly-reachable | historically-impacting | The daily growth snapshot has two permanent unrecoverable gaps and nothing detects or backfills a missed run |
| CRON-IGX-001 | medium | jobs | directly-reachable | latent | instagram-refresh marks an account disconnected on ANY thrown error, including a transient Meta outage |
| CRON-OBS-001 | medium | logging | directly-reachable | actively-impacting | No cron endpoint reports to Sentry; a missed or failed run is invisible, and two misses already went unnoticed |
| CRON-PRG-001 | medium | jobs | directly-reachable | unknown | The 30-day reference-image purge is non-paginated, non-recursive and error-discarding, and it is named as the safety net for a purge path that deliberately does not throw |
| CRON-RET-001 | medium | data-retention | currently-unreachable | latent | retention-purge has never deleted a row in production and cannot until 2028, yet has zero tests and a silent partial-failure mode |
| CRON-SEC-001 | medium | secrets | conditionally-reachable | latent | One CRON_SECRET authorises eleven endpoints including bulk deletion and customer email, and doubles as the Instagram OAuth state signing key |
| CRON-TOK-001 | medium | jobs | conditionally-reachable | latent | Reconfirmation rotates the customer's magic-link token before sending the email, so a crash between the two permanently locks the customer out |
| DATA-MIG-003 | medium | migration | conditionally-reachable | theoretical | Two migrations state that Supabase default privileges grant service_role EXECUTE; measured, the privilege comes from PUBLIC, so `revoke ... from public` silently removes it in production |
| DRIFT-ACT-001 | medium | web | directly-reachable | actively-impacting | Two independent implementations of saveBooksSettingsAction are both wired to live forms, and they disagree about whether opening or closing the books is audited |
| DRIFT-NN-001 | medium | database | conditionally-reachable | latent | Production's founding_artist_applications lacks 5 NOT NULL constraints that migration 0056 declares, because 0056 was written retroactively to describe a table production already had |
| DRIFT-POL-001 | medium | database | currently-unreachable | latent | Production's booking_interests RLS policy name contains an embedded CRLF, so the house `drop policy if exists` repair pattern silently cannot address it |
| OPS-CIX-001 | medium | ci-cd | directly-reachable | actively-impacting | The legal-artifact gate and the new path-resolution test are runnable everywhere but enforced nowhere |
| PAY-CHK-001 | medium | payment | conditionally-reachable | latent | prepareCheckoutAction deletes orphaned order on failure without verifying concurrent state |
| PAY-FEE-004 | medium | payment | currently-unreachable | latent | Fee schedule v2 has no defined rate for a legacy_free_v1 artist who carries the deposits override |
| SEED-GRT-001 | medium | production-config | directly-reachable | latent | seed.sql re-grants ALL on ALL public tables to anon and authenticated after every local reset, clobbering the migrations' REVOKEs; its hand-maintained mirror list misses 0067, so two growth views are wide open locally and correctly locked in production |
| SEED-GRT-002 | medium | production-config | directly-reachable | latent | seed.sql mirrors payment_allocations REVOKE from 0125 but omits payment_collections REVOKE, leaving local stack with authenticated TRUNCATE on a service-role-only table |
| WHK-DEA-001 | medium | webhook | conditionally-reachable | latent | The deauthorize branch's own comment claims re-onboarding overwrites the stored Connect id; ensureConnectAccount returns it unchanged, and AGENTS.md says the opposite of the comment |
| WHK-DSP-001 | medium | webhook | unknown | unknown | The charge.dispute.* handler exists in code but no artifact in the repository subscribes the endpoint to it, and the commit that added the handler changed no runbook |
| WHK-RFD-001 | medium | webhook | directly-reachable | latent | charge.refunded records at most one audit row per booking carrying the first cumulative amount, so a partial refund is indistinguishable from a full one and later partials are never recorded |
| WHK-RTY-001 | medium | webhook | directly-reachable | unknown | The file identifies Stripe endpoint auto-disabling as a hazard in one branch and then returns 4xx from six other branches for permanently unsatisfiable conditions |
| WHK-SPN-001 | medium | webhook | conditionally-reachable | latent | A failed sponsorship booked-stamp after a SUCCESSFUL increment leaves the cap permanently over-consumed, and the comment asserting otherwise only covers the other case |
| AUTH-GRT-001 | low | authorization | currently-unreachable | latent | All 107 public tables in production grant TRUNCATE to `authenticated`, and RLS does not gate TRUNCATE — a layer the codebase already treats as real for exactly one table |
| BDEL-STE-001 | low | billing | directly-reachable | reachable-no-known-impact | profiles already carries account_status, deleted_at, deleted_by, suspended_at and suspended_reason, but account_status enforces nothing outside admin surfaces |
| CRON-AUT-001 | low | jobs | directly-reachable | theoretical | Seven of eight cron endpoints use a plain string comparison for the bearer secret while the repo's own timing-safe helper is used by exactly one |
| CRON-CCH-001 | low | jobs | conditionally-reachable | latent | Module-scope artist caches are never invalidated and cache a swallowed profile-read failure for the whole run |
| CRON-GSC-001 | low | jobs | currently-unreachable | latent | gsc-sync releases the sync lock without checking ownership, so a stale takeover leads to two runs holding it |
| CRON-TZO-001 | low | jobs | conditionally-reachable | latent | Reminder candidate windows are computed in server-local time while the match is computed in artist time, so far-western artists silently never receive minimum-day reminders |
| DATA-ORPH-001 | low | web | conditionally-reachable | latent | createProductAction inserts the product row before processing images and returns the image error without deleting it, so every failed image upload leaves an untitled-to-the-artist orphan product that still consumes the plan's active-product cap |
| DRIFT-FN-001 | low | database | directly-reachable | reachable-no-known-impact | Production's map_search body and idx_map_locations_city_trgm expression differ from committed migration 0097, which documents in its own header that it was hand-applied to production |
| OPS-CFG-001 | low | production-config | directly-reachable | reachable-no-known-impact | The grandfathering backfill defaults ADMIN_EMAILS to a hardcoded personal address; the application's admin guard has no default at all |
| OPS-CRD-001 | low | secrets | conditionally-reachable | latent | RISK INTRODUCED BY THIS REMEDIATION: an exported DATABASE_URL now outranks apps/web/.env.local in every governance recorder |
| OPS-ERR-001 | low | api | directly-reachable | actively-impacting | Raw Postgres error messages are returned to clients from 91 call sites — 60 in the mobile JSON API and 31 in web server actions |
| PAY-FEE-003 | low | payment | conditionally-reachable | theoretical | The fee-actuals write is the only write on the settlement path with no ordering guard and no derivation from stored state, so a later delivery overwrites it from whatever its payload says |
| WHK-CUR-001 | low | webhook | conditionally-reachable | theoretical | The currency anti-tamper backstop is switched off for the combined deposit-plus-goods lane |
| WHK-EVT-001 | low | webhook | unknown | theoretical | event.account is asserted on one branch of five, event.livemode on none, and the one branch with no compensating check writes a caller-named booking_id straight into audit_log |
| BDEL-POL-001 | informational | governance | currently-unreachable | theoretical | UNRATIFIED: no product policy exists for what deletion does to an active subscription; the period-end rule in Terms is scoped to cancellation, not deletion |
| BDEL-TGT-001 | informational | governance | unknown | unknown | DESIGN RECORD (not a defect): target billing-aware deletion flow, boundaries, schema, migration, test and rollback plan |
| DRIFT-ENM-001 | informational | database | currently-unreachable | latent | Four orphan enum types exist in production that no migration file mentions and no column uses |
| OPS-DOC-001 | informational | tooling | directly-reachable | reachable-no-known-impact | Twelve tracked docs still instruct the reader to cd into a machine-absolute path that exists on one computer |

## In progress (0)

_None._

## Fixed but NOT verified (13)

A commit exists. Nothing independent has confirmed it works.

| ID | Sev | Domain | Reachability | Impact | Title |
| --- | --- | --- | --- | --- | --- |
| AUTH-RPC-001 | critical | authorization | currently-unreachable | historically-impacting | book_flash_item and increment_fee_sponsored_used were callable by anon via PostgREST until 0060 revoked the grants |
| PAY-DEP-001 | critical | payment | directly-reachable | historically-impacting | A Stripe failure silently converted a card deposit into a manual one, producing a booking with no pay button; the first fix re-opened the same silent degradation |
| DATA-MIG-001 | high | migration | directly-reachable | historically-impacting | `migration repair --status applied` on 2026-04-20 marked 0001_rls_policies.sql applied without running it, leaving 6 core tables with RLS disabled in production for ~3 weeks |
| PAY-CONN-001 | high | payment | directly-reachable | historically-impacting | Cached Connect state asserted a routing capability Stripe denied, and the first corrective predicate was broad enough to downgrade the entire artist fleet on one platform-scope fault |
| PAY-FEE-002 | high | payment | currently-unreachable | latent | The appointment platform fee was computed on the whole frozen basket while the charge was the remainder, so a partial collection was charged the fee twice and could exceed the amount |
| PAY-SPON-001 | high | payment | directly-reachable | historically-impacting | Sponsorship waivers were released against PaymentIntent metadata (intent) rather than what settlement actually booked, erasing other bookings' real cap usage; and the first webhook release added a delta instead of converging to a target |
| PAY-WHK-001 | high | webhook | currently-unreachable | latent | A P9 appointment-payment intent reaching the deposit webhook answers 409, which is a failed delivery that would push Stripe toward disabling the endpoint every real deposit settles on |
| BILL-UI-001 | medium | billing | directly-reachable | latent | A completed statutory withdrawal does not revalidate anything, so /settings/plan keeps rendering the artist as an active Plus subscriber after their contract has ended and their refund has been issued |
| BILL-UI-002 | medium | billing | directly-reachable | reachable-no-known-impact | Consumer Plus checkout showed 3 of 4 Art. 8(2) elements adjacent to the order button; main service characteristics sat above the panel |
| DATA-MIG-002 | medium | migration | conditionally-reachable | latent | 68 `create table if not exists` blocks declare constraints inline, so the documented non-convergence footgun is systemic — and the 0122 remediation that produced the footgun entry is itself partial |
| OPS-TOOL-001 | medium | tooling | directly-reachable | actively-impacting | Ten governance scripts hardcode the absolute Windows path A:/WORK/inklee, so none can run in CI or on any other machine |
| COPY-UI-001 | low | web | directly-reachable | actively-impacting | Two em-dashes in user-visible checkout copy on the screen where a consumer commits to a recurring charge, plus a yearly option that renders only for a cohort that does not exist |
| OPS-LINT-001 | low | ci-cd | directly-reachable | actively-impacting | packages/shared is linted by nothing, so 'lint 0 errors' has always been vacuous for 78 files including all the money math |

## Verified, but NOT independently (0)

Verified by the same instance or process that produced the fix. Recorded as a limitation, not as assurance.

_None._

## Deferred (2)

| ID | Sev | Domain | Reachability | Impact | Title |
| --- | --- | --- | --- | --- | --- |
| PAY-BAL-001 | high | payment | conditionally-reachable | latent | deposit and balance payment requests have no subject-scoped ceiling because the stored final service price is null in production |
| BILL-UI-003 | low | billing | conditionally-reachable | latent | Consumer Plus checkout fail-safe path defers the total price to Stripe Checkout, off the order screen |

## Risk accepted (0)

_None._

## Mitigated but not fixed (1)

| ID | Sev | Domain | Reachability | Impact | Title |
| --- | --- | --- | --- | --- | --- |
| BILL-CONF-001 | low | billing | conditionally-reachable | latent | Durable purchase confirmation could silently ship without the inline Terms text on a fail-soft path |

## Verification blocked or impossible (0)

_None._

## Production reachability UNKNOWN (3)

Reachability was not established. These need production-state confirmation before they can be prioritized honestly.

| ID | Sev | Domain | Reachability | Impact | Title |
| --- | --- | --- | --- | --- | --- |
| WHK-DSP-001 | medium | webhook | unknown | unknown | The charge.dispute.* handler exists in code but no artifact in the repository subscribes the endpoint to it, and the commit that added the handler changed no runbook |
| WHK-EVT-001 | low | webhook | unknown | theoretical | event.account is asserted on one branch of five, event.livemode on none, and the one branch with no compensating check writes a caller-named booking_id straight into audit_log |
| BDEL-TGT-001 | informational | governance | unknown | unknown | DESIGN RECORD (not a defect): target billing-aware deletion flow, boundaries, schema, migration, test and rollback plan |

