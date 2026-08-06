<!-- GENERATED FILE - DO NOT EDIT.
     Source of truth: docs/audit/findings.yaml
     Regenerate:      pnpm audit:generate
     Edits here are overwritten and will fail `pnpm audit:check` in CI. -->

# Unresolved findings

**Ledger content hash:** `dd16cf2993e3`  (sha256 of findings.yaml, first 12; deliberately not a clock or a git commit, see scripts/audit/generate.cjs)

Operational view. Generated from the ledger; do not edit.

## Open (57)

| ID | Sev | Domain | Reachability | Impact | Title |
| --- | --- | --- | --- | --- | --- |
| ABUSE-PUB-001 | high | public-surface | directly-reachable | latent | The public project intake server action has none of the five abuse controls its direct sibling, the public booking intake, applies — no honeypot, no origin check, no rate limit, no image MIME allowlist and no dedupe |
| AUTH-RLS-003 | high | authorization | directly-reachable | latent | product_collections RLS DELETE policy allows artists to bypass delete_collection_if_eligible safety check, cascade-deleting populated collection items |
| BILL-ENT-002 | high | billing | conditionally-reachable | latent | OPEN: account deletion cancels PaymentIntents but never the subscription, and all nine billing/tax tables cascade-delete with the profile |
| PAY-CONN-002 | high | payment | conditionally-reachable | latent | Custom Connect requirement/restriction reminders reach the platform inbox, never the artist |
| PAY-ORD-001 | high | payment | conditionally-reachable | latent | The refund ordering guard compares a second-granularity clock with a strict `<`, so a stale `charge.refunded` created in the same second as the newest one is applied and walks the recorded refund backwards |
| WHK-ERR-001 | high | webhook | directly-reachable | unknown | 17 of 23 Supabase calls in the deposit webhook discard the error, and the handler then returns HTTP 200, so Stripe never redelivers and the skipped money work is permanently lost |
| WHK-TOK-001 | high | webhook | directly-reachable | latent | The customer's magic-link token is rotated inside the atomic settlement flip, then delivered by an email path that swallows every error and can never be retried |
| BDEL-CON-001 | medium | billing | directly-reachable | latent | Counsel decision 7 on the Connected Account is half implemented: the pointer is retained but the scheduled account deletion at window-end was never built, and the pointer is purged at seven years |
| BILL-BST-001 | medium | billing | conditionally-reachable | latent | The deleted-profile safe branch never advances last_reconciled_at, so every dead row is re-picked forever and can STARVE the backstop that exists to catch lost webhooks |
| BILL-TAX-001 | medium | billing | directly-reachable | actively-impacting | No invoice.paid writer exists for a sale-side (kind='charge') tax snapshot; the first live consumer Plus sale produced zero charge-kind rows in transaction_tax_snapshots |
| CRON-CAP-001 | medium | jobs | conditionally-reachable | latent | The per-artist 10-email daily cap is consumed in branch order, and a capped appointment reminder is lost rather than deferred |
| CRON-COV-001 | medium | jobs | conditionally-reachable | unknown | coverage-worker has no run-level mutual exclusion and its real cadence comes from a GitHub Actions schedule against production, making overlap plausible for the non-task work |
| CRON-GRW-001 | medium | jobs | directly-reachable | historically-impacting | The daily growth snapshot has two permanent unrecoverable gaps and nothing detects or backfills a missed run |
| CRON-OBS-001 | medium | logging | directly-reachable | actively-impacting | No cron endpoint reports to Sentry; a missed or failed run is invisible, and two misses already went unnoticed |
| CRON-PRG-001 | medium | jobs | directly-reachable | unknown | The 30-day reference-image purge is non-paginated, non-recursive and error-discarding, and it is named as the safety net for a purge path that deliberately does not throw |
| CRON-RET-001 | medium | data-retention | currently-unreachable | latent | retention-purge has never deleted a row in production and cannot until 2028, yet has zero tests and a silent partial-failure mode |
| CRON-SEC-001 | medium | secrets | conditionally-reachable | latent | One CRON_SECRET authorises eleven endpoints including bulk deletion and customer email, and doubles as the Instagram OAuth state signing key |
| CRON-TOK-001 | medium | jobs | conditionally-reachable | latent | Reconfirmation rotates the customer's magic-link token before sending the email, so a crash between the two permanently locks the customer out |
| DATA-MIG-003 | medium | migration | conditionally-reachable | theoretical | Two migrations state that Supabase default privileges grant service_role EXECUTE; measured, the privilege comes from PUBLIC, so `revoke ... from public` silently removes it in production |
| DPIA-GAL-002 | medium | governance | unknown | latent | assertDpiaPreconditionsMet('gallery') has no callers anywhere in the live gallery path; recording the R3/R4/R6 gate keys enforces nothing on artist access |
| DRIFT-ACT-001 | medium | web | directly-reachable | actively-impacting | Two independent implementations of saveBooksSettingsAction are both wired to live forms, and they disagree about whether opening or closing the books is audited |
| DRIFT-NN-001 | medium | database | conditionally-reachable | latent | Production's founding_artist_applications lacks 5 NOT NULL constraints that migration 0056 declares, because 0056 was written retroactively to describe a table production already had |
| DRIFT-POL-001 | medium | database | currently-unreachable | latent | Production's booking_interests RLS policy name contains an embedded CRLF, so the house `drop policy if exists` repair pattern silently cannot address it |
| GOODS-DISC-002 | medium | payment | currently-unreachable | latent | The model withdrawal form is built, gated and reachable, but no order receipt ever links to it: buildOrderReceiptBody is called WITHOUT withdrawalFormHref at BOTH real send sites, so counsel's C1.2 '[link/attached]' bracket is unfilled on the durable record |
| OPS-CIX-001 | medium | ci-cd | directly-reachable | actively-impacting | The legal-artifact gate and the new path-resolution test are runnable everywhere but enforced nowhere |
| PAY-CHK-001 | medium | payment | conditionally-reachable | latent | prepareCheckoutAction deletes orphaned order on failure without verifying concurrent state |
| PAY-RFD-008 | medium | payment | conditionally-reachable | latent | refundDepositCore now issues a PARTIAL Stripe refund with refund_application_fee, and has no test of any kind; the platform fee it returns is proportional to the amount, not to the deposit lane |
| WHK-DEA-001 | medium | webhook | conditionally-reachable | latent | The deauthorize branch's own comment claims re-onboarding overwrites the stored Connect id; ensureConnectAccount returns it unchanged, and AGENTS.md says the opposite of the comment |
| WHK-DSP-001 | medium | webhook | unknown | unknown | The charge.dispute.* handler exists in code but no artifact in the repository subscribes the endpoint to it, and the commit that added the handler changed no runbook |
| WHK-RFD-001 | medium | webhook | directly-reachable | latent | charge.refunded records at most one audit row per booking carrying the first cumulative amount, so a partial refund is indistinguishable from a full one and later partials are never recorded |
| WHK-RTY-001 | medium | webhook | directly-reachable | unknown | The file identifies Stripe endpoint auto-disabling as a hazard in one branch and then returns 4xx from six other branches for permanently unsatisfiable conditions |
| WHK-SPN-001 | medium | webhook | conditionally-reachable | latent | A failed sponsorship booked-stamp after a SUCCESSFUL increment leaves the cap permanently over-consumed, and the comment asserting otherwise only covers the other case |
| AUTH-GRT-001 | low | authorization | currently-unreachable | latent | All 107 public tables in production grant TRUNCATE to `authenticated`, and RLS does not gate TRUNCATE — a layer the codebase already treats as real for exactly one table |
| BDEL-STE-001 | low | billing | directly-reachable | reachable-no-known-impact | profiles already carries account_status, deleted_at, deleted_by, suspended_at and suspended_reason, but account_status enforces nothing outside admin surfaces |
| BILL-TAX-002 | low | billing | directly-reachable | actively-impacting | The first live consumer credit-note tax snapshot resolved to tax_treatment='manual_review' instead of a determinate zero-VAT class |
| CRON-AUT-001 | low | jobs | directly-reachable | theoretical | Seven of eight cron endpoints use a plain string comparison for the bearer secret while the repo's own timing-safe helper is used by exactly one |
| CRON-CCH-001 | low | jobs | conditionally-reachable | latent | Module-scope artist caches are never invalidated and cache a swallowed profile-read failure for the whole run |
| CRON-GSC-001 | low | jobs | currently-unreachable | latent | gsc-sync releases the sync lock without checking ownership, so a stale takeover leads to two runs holding it |
| CRON-TZO-001 | low | jobs | conditionally-reachable | latent | Reminder candidate windows are computed in server-local time while the match is computed in artist time, so far-western artists silently never receive minimum-day reminders |
| DATA-ORPH-001 | low | web | conditionally-reachable | latent | createProductAction inserts the product row before processing images and returns the image error without deleting it, so every failed image upload leaves an untitled-to-the-artist orphan product that still consumes the plan's active-product cap |
| DRIFT-FN-001 | low | database | directly-reachable | reachable-no-known-impact | Production's map_search body and idx_map_locations_city_trgm expression differ from committed migration 0097, which documents in its own header that it was hand-applied to production |
| HUB-GAL-007 | low | data-retention | directly-reachable | latent | An image uploaded but never saved is an orphan no cleanup can see: removeDroppedHubImages diffs PERSISTED state against saved state, so a file that never reached a save has no prior state to be dropped from |
| OBS-MAP-001 | low | analytics | directly-reachable | actively-impacting | Public-map analytics plane has recorded zero events and one pageview since the 2026-07-27 launch; silence cause indistinguishable from repo+DB evidence |
| OBS-NOISE-001 | low | logging | directly-reachable | actively-impacting | Scanner probes and stale-deployment Server Action errors page us as high-priority Sentry alerts |
| OPS-CFG-001 | low | production-config | directly-reachable | reachable-no-known-impact | The grandfathering backfill defaults ADMIN_EMAILS to a hardcoded personal address; the application's admin guard has no default at all |
| OPS-CRD-001 | low | secrets | conditionally-reachable | latent | RISK INTRODUCED BY THIS REMEDIATION: an exported DATABASE_URL now outranks apps/web/.env.local in every governance recorder |
| OPS-ERR-001 | low | api | directly-reachable | actively-impacting | Raw Postgres error messages are returned to clients from 91 call sites — 60 in the mobile JSON API and 31 in web server actions |
| PAY-AUD-001 | low | payment | directly-reachable | reachable-no-known-impact | audit_log counts paid deposits 5x under booking_requests: only the webhook path writes deposit_paid audit rows, the manual-mark path does not |
| PAY-FEE-003 | low | payment | conditionally-reachable | theoretical | The fee-actuals write is the only write on the settlement path with no ordering guard and no derivation from stored state, so a later delivery overwrites it from whatever its payload says |
| SHOP-VIS-002 | low | public-surface | conditionally-reachable | latent | A product hidden from the public shop is still sellable through the appointment add-on checkout, which contradicts the decision already settled for the shop reads |
| WHK-CUR-001 | low | webhook | conditionally-reachable | theoretical | The currency anti-tamper backstop is switched off for the combined deposit-plus-goods lane |
| WHK-EVT-001 | low | webhook | unknown | theoretical | event.account is asserted on one branch of five, event.livemode on none, and the one branch with no compensating check writes a caller-named booking_id straight into audit_log |
| BDEL-POL-001 | informational | governance | currently-unreachable | theoretical | UNRATIFIED: no product policy exists for what deletion does to an active subscription; the period-end rule in Terms is scoped to cancellation, not deletion |
| BDEL-TGT-001 | informational | governance | unknown | unknown | DESIGN RECORD (not a defect): target billing-aware deletion flow, boundaries, schema, migration, test and rollback plan |
| DRIFT-ENM-001 | informational | database | currently-unreachable | latent | Four orphan enum types exist in production that no migration file mentions and no column uses |
| OPS-DOC-001 | informational | tooling | directly-reachable | reachable-no-known-impact | Twelve tracked docs still instruct the reader to cd into a machine-absolute path that exists on one computer |
| TEST-VAC-009 | informational | testing | unknown | theoretical | The /legal/report 'DRIFT' test cannot fail on form-vs-action divergence, because both derive from one module; it guards a risk already eliminated by construction |

## In progress (3)

| ID | Sev | Domain | Reachability | Impact | Title |
| --- | --- | --- | --- | --- | --- |
| GOODS-SET-001 | high | web | directly-reachable | latent | A discarded read in a read-modify-write DESTROYS the artist's entire settings blob, and being a write it does not self-heal |
| BDEL-RET-002 | medium | data-retention | conditionally-reachable | latent | The 0129 retention repair created the inverse gap: five billing tables now survive account deletion INDEFINITELY because nothing purges them |
| SEED-GRT-001 | medium | production-config | directly-reachable | latent | seed.sql re-grants ALL on ALL public tables to anon and authenticated after every local reset, clobbering the migrations' REVOKEs; its hand-maintained mirror list misses 0067, so two growth views are wide open locally and correctly locked in production |

## Fixed but NOT verified (70)

A commit exists. Nothing independent has confirmed it works.

| ID | Sev | Domain | Reachability | Impact | Title |
| --- | --- | --- | --- | --- | --- |
| AUTH-RPC-001 | critical | authorization | currently-unreachable | historically-impacting | book_flash_item and increment_fee_sponsored_used were callable by anon via PostgREST until 0060 revoked the grants |
| PAY-DEP-001 | critical | payment | directly-reachable | historically-impacting | A Stripe failure silently converted a card deposit into a manual one, producing a booking with no pay button; the first fix re-opened the same silent degradation |
| AUTH-MFA-001 | high | auth | directly-reachable | reachable-no-known-impact | The MFA step-up gate fails OPEN on a transient failure, in production, and the page it redirects to fails open in the same direction |
| BDEL-PAY-001 | high | billing | directly-reachable | latent | Account deletion does not archive or pseudonymize P9 appointment payment data before the cascade destroys it |
| BDEL-PAY-002 | high | data-retention | conditionally-reachable | latent | Account deletion's deposit read discarded its error, so a transient read failure let deletion proceed as though the artist had no deposits at all |
| BDEL-RET-001 | high | data-retention | conditionally-reachable | latent | Terms and Privacy promise post-deletion retention of billing and tax records that the cascade destroys, and the retained archive has no field for any of them |
| BDEL-SUB-001 | high | billing | conditionally-reachable | latent | Confirms and extends BILL-ENT-002: deletion never touches the subscription, and the cascade is now empirically shown to destroy billing_subscriptions and billing_consent_records |
| BDEL-TTS-001 | high | billing | conditionally-reachable | latent | An append-only trigger on transaction_tax_snapshots aborts the profiles cascade, so account deletion fails permanently after irreversibly cancelling the client's deposit PaymentIntents |
| CRON-CLN-001 | high | jobs | conditionally-reachable | latent | cleanup discards the error from the 7-year financial-retention lookup, so a transient failure deletes bookings carrying financial records |
| CRON-RMD-001 | high | jobs | directly-reachable | actively-impacting | Deposit-overdue reminder re-sends to the same customer every day forever; one production recipient has received 46 |
| DATA-MIG-001 | high | migration | directly-reachable | historically-impacting | `migration repair --status applied` on 2026-04-20 marked 0001_rls_policies.sql applied without running it, leaving 6 core tables with RLS disabled in production for ~3 weeks |
| GAL-REL-001 | high | storage | conditionally-reachable | latent | The C1.5 gallery relocation control silently and PERMANENTLY self-disables on a transient read failure, leaving client photographs public |
| PAY-AUTHZ-001 | high | payment | conditionally-reachable | latent | refundDepositCore refunded whatever PaymentIntent the booking row named, without ever checking the intent belonged to the caller - and the pattern is LIVE ON PRODUCTION |
| PAY-AUTHZ-002 | high | payment | conditionally-reachable | latent | refundGoodsOrderCore had the same defect, and the attacker authors the order_items the refund amount is computed from |
| PAY-CONN-001 | high | payment | directly-reachable | historically-impacting | Cached Connect state asserted a routing capability Stripe denied, and the first corrective predicate was broad enough to downgrade the entire artist fleet on one platform-scope fault |
| PAY-FEE-002 | high | payment | currently-unreachable | latent | The appointment platform fee was computed on the whole frozen basket while the charge was the remainder, so a partial collection was charged the fee twice and could exceed the amount |
| PAY-ORD-002 | high | payment | conditionally-reachable | latent | A `payment_intent.succeeded` cannot move a request out of `failed`, so a collection recorded after a payment_failed on the same intent leaves the request permanently `failed` with the money already allocated, and says nothing |
| PAY-RFD-002 | high | payment | currently-unreachable | latent | Fee refund policy v1 'retain non-recoverable' retains the whole platform fee, not the actual Stripe cost |
| PAY-RFD-011 | high | payment | conditionally-reachable | latent | The refund path cannot tell a failed payment_collections read from an absent row, and the fallback can retain processor cost from the buyer twice |
| PAY-RLS-005 | high | payment | currently-unreachable | latent | 0128 anon SELECT policies expose every sent payment request via the anon key |
| PAY-SPON-001 | high | payment | directly-reachable | historically-impacting | Sponsorship waivers were released against PaymentIntent metadata (intent) rather than what settlement actually booked, erasing other bookings' real cap usage; and the first webhook release added a delta instead of converging to a target |
| PAY-WHK-001 | high | webhook | currently-unreachable | latent | A P9 appointment-payment intent reaching the deposit webhook answers 409, which is a failed delivery that would push Stripe toward disabling the endpoint every real deposit settles on |
| WEB-XSS-001 | high | web | conditionally-reachable | latent | Stored XSS on the public /studios/[slug] page: JSON-LD emitted with raw JSON.stringify into dangerouslySetInnerHTML, bypassing the repo's own escaper |
| WHK-COLL-001 | high | webhook | currently-unreachable | latent | P9 appointment-payment intents stamp metadata.booking_id into the same payment_intent.succeeded stream the deposit webhook claims, and the deposit webhook has no discriminator |
| BILL-ENT-001 | medium | entitlement | directly-reachable | reachable-no-known-impact | OPEN: creating a live Stripe Connect account is gated on auth and rate limit but not on entitlement |
| BILL-UI-001 | medium | billing | directly-reachable | latent | A completed statutory withdrawal does not revalidate anything, so /settings/plan keeps rendering the artist as an active Plus subscriber after their contract has ended and their refund has been issued |
| BILL-UI-002 | medium | billing | directly-reachable | reachable-no-known-impact | Consumer Plus checkout showed 3 of 4 Art. 8(2) elements adjacent to the order button; main service characteristics sat above the panel |
| CRON-IGX-001 | medium | jobs | directly-reachable | latent | instagram-refresh marks an account disconnected on ANY thrown error, including a transient Meta outage |
| DATA-MIG-002 | medium | migration | conditionally-reachable | latent | 68 `create table if not exists` blocks declare constraints inline, so the documented non-convergence footgun is systemic — and the 0122 remediation that produced the footgun entry is itself partial |
| DATA-MIG-004 | medium | migration | conditionally-reachable | latent | 0148's purge self-reference exclusion is one level deep, so a 3-link correction chain aborts the whole retention step with FK 23503 every cycle |
| DISC-FORM-001 | medium | email | currently-unreachable | latent | Withdrawal-form suppression trusted the order-level claim alone, so a mis-flagged line still lost the form — the exact Art. 10 case counsel's §7.2 condition 1 refuses |
| DPIA-GAL-001 | medium | entitlement | directly-reachable | reachable-no-known-impact | LO-5 DPIA §2/§10 and migration 0151 assert the gallery capability 'has never been granted to any artist'; a comp-Plus account has held the live entitlement since 2026-06-05 |
| FEE-DSP-002 | medium | analytics | directly-reachable | actively-impacting | The artist fee-savings goods lane has been dead since it shipped: a column that does not exist, an error nobody read, and a double-count hiding underneath it |
| FEE-STP-001 | medium | billing | conditionally-reachable | latent | Settlement stamps the fee schedule VERSION but not the resolved TIER, so under v2 a stored (version, base) pair cannot reproduce the charged fee; the appointment-payment lane stamps the version only into the audit log, and the deposit lane stamps it at settlement time rather than from the intent |
| GOODS-DISC-001 | medium | payment | directly-reachable | latent | The C1.1/C1.2/C1.3 checkout disclosures (seller identity, custom-made return exemption, durable-record receipt) were built ONLY for the standalone shop checkout; the appointment add-on checkout (booking-deposit flow) can sell the exact same custom-made product with none of them |
| GOODS-VAR-001 | medium | database | conditionally-reachable | latent | reconcileVariants would hard-delete a variant sold ONLY inside a bundle, stranding the sale's snapshot and silently breaking its refund restock |
| HUB-GAL-001 | medium | billing | conditionally-reachable | latent | image_gallery entitlement enforced only at render, not at save, so a Free artist could persist Plus gallery blocks |
| HUB-GAL-004 | medium | web | conditionally-reachable | latent | isPrivateIpv6 has proven coverage holes (v4-mapped hex, v4-compatible, NAT64 forms all ALLOWED), fails OPEN on garbage against its own doc comment, and the IPv6-literal branch is dead only by accident of URL bracket handling |
| HUB-GAL-008 | medium | web | conditionally-reachable | latent | The IPv6 blanket refusal breaks Import-from-URL for most real image hosts, and the comment justifying it asserted the opposite without measuring |
| HUB-GAL-009 | medium | data-retention | directly-reachable | latent | A downgraded artist's gallery images stayed publicly fetchable forever: the entitlement gate hid the RENDER, never the objects |
| MAP-SSRF-001 | medium | jobs | conditionally-reachable | latent | The map coverage ingest fetched third-party URLs behind a hostname check that never resolved DNS, while the hardened resolving guard sat one import away |
| MIG-DROP-001 | medium | migration | conditionally-reachable | latent | Bare `drop constraint` without `if exists` means two migrations cannot repair a dropped constraint: proven non-convergent by execution, and fixed in 0143 |
| OPS-TOOL-001 | medium | tooling | directly-reachable | actively-impacting | Ten governance scripts hardcode the absolute Windows path A:/WORK/inklee, so none can run in CI or on any other machine |
| PAY-AUTHZ-003 | medium | payment | conditionally-reachable | latent | The appointment refund read allocations and updated payment_collections keyed on the intent id alone, held up only by an undocumented accident |
| PAY-FEE-004 | medium | payment | currently-unreachable | latent | Fee schedule v2 has no defined rate for a legacy_free_v1 artist who carries the deposits override |
| PAY-RFD-003 | medium | payment | conditionally-reachable | latent | Artist refund route lets the artist choose the fee-refund case, controlling Inklee's fee |
| PAY-RFD-004 | medium | payment | conditionally-reachable | latent | Refund idempotency key contains Date.now(), so a retry creates a second Stripe refund |
| PAY-RFD-007 | medium | payment | conditionally-reachable | latent | No artist self-serve refund path for money collected on a cancelled/expired/failed request |
| PAY-RFD-009 | medium | payment | conditionally-reachable | latent | The appointment by-line refund summed each selected line's FULL original allocation every call, so re-selecting an exhausted line over-refunded by misattribution |
| PAY-RFD-010 | medium | payment | conditionally-reachable | latent | The appointment refund's idempotency key omitted the line selection the goods path deliberately fingerprints, and the ledger insert that caught the collision was swallowed, so the artist was told a refund succeeded while Stripe moved nothing |
| PAY-WHK-002 | medium | webhook | conditionally-reachable | latent | charge.refunded treated an AMBIGUOUS booking lookup as absence: two rows claiming one intent silently skipped the sponsorship release and the double-refund guard |
| SEED-GRT-002 | medium | production-config | directly-reachable | latent | seed.sql mirrors payment_allocations REVOKE from 0125 but omits payment_collections REVOKE, leaving local stack with authenticated TRUNCATE on a service-role-only table |
| SHOP-DROP-002 | medium | payment | conditionally-reachable | latent | The drop gate was absent from the PAYABLE add-on read while present on the display read beside it, so an undropped product was sellable where it was refused everywhere else |
| SHOP-FUL-004 | medium | payment | conditionally-reachable | latent | Post-flip WRITE failures on the refund path are silently swallowed: restockInventory ignores its PostgREST errors and the redemption delete's result is discarded, losing restock and/or cap release with the flip consumed and no observability |
| TEST-VAC-004 | medium | testing | currently-unreachable | latent | The sweep test claiming cancelled-on-Stripe-then-the-order-row asserts only existence, not sequence: reversing the order (the exact SHOP-ORD-002 defect ordering) survives the full suite |
| TEST-VAC-006 | medium | testing | currently-unreachable | latent | SHOP-FUL-004's observability has zero tests: deleting a capture site leaves the full suite green, and no test references reportStockWriteFailure or either Sentry tag |
| TEST-VAC-007 | medium | testing | currently-unreachable | latent | The webhook deposit fee-schedule/tier stamp, the flagship FEE-STP-001 site, has no route-level coverage: reverting it to the settlement-time ACTIVE read survives |
| BILL-UI-003 | low | billing | conditionally-reachable | latent | Consumer Plus checkout fail-safe path defers the total price to Stripe Checkout, off the order screen |
| COPY-UI-001 | low | web | directly-reachable | actively-impacting | Two em-dashes in user-visible checkout copy on the screen where a consumer commits to a recurring charge, plus a yearly option that renders only for a cohort that does not exist |
| GAL-PATH-001 | low | storage | conditionally-reachable | theoretical | ownedHubImagePath derives a storage path from a non-Inklee host that embeds the gallery marker, contradicting its docstring claim that an external URL returns null |
| HUB-DST-001 | low | web | conditionally-reachable | latent | The FD8 destination formula called the standalone shop AVAILABLE while the platform park switch was off, so a brand-new goods block defaulted to a public link to a 404 with no editor warning, and the visibility summary reported the artist as published |
| HUB-GAL-005 | low | web | conditionally-reachable | latent | URL credentials are not rejected: userinfo in an artist-supplied import URL is transmitted to the third-party host while the SSRF guard sees only the clean hostname |
| HUB-GAL-006 | low | web | conditionally-reachable | latent | The hosted-logos marker single-sourcing is incomplete: a second literal survives in mobile-goods-server.ts while the parser comment claims the drift risk was closed |
| MIG-IDX-001 | low | migration | currently-unreachable | latent | `create index if not exists` is an existence check, not a shape check: a wrong-shaped index under the right name survives a successful re-run, proven by execution and fixed in 0148 |
| OPS-LINT-001 | low | ci-cd | directly-reachable | actively-impacting | packages/shared is linted by nothing, so 'lint 0 errors' has always been vacuous for 78 files including all the money math |
| PAY-UI-006 | low | payment | directly-reachable | latent | Payments list UI cancel-button state set drifted from the core's authorization constant |
| SHOP-FUL-005 | low | webhook | conditionally-reachable | latent | A settle that returns false answers Stripe 200, so recovery from a pre-flip refusal falls entirely to the daily sweep: worst case roughly two days with money captured and the order still pending |
| SHOP-ORD-003 | low | jobs | conditionally-reachable | latent | The intent-aware sweep is unbounded and serial inside a cron with no maxDuration, and skipped rows never reach the audit payload |
| TEST-VAC-005 | low | testing | currently-unreachable | latent | The sweep's Stripe-cancel status predicate is unpinned: narrowing it strands requires_confirmation / requires_action intents payable while their rows cancel |
| TEST-VAC-008 | low | testing | currently-unreachable | latent | The goods cap-release once-only flip gate was correct but UNPINNED: removing it survived the entire suite |

## Verified, but NOT independently (0)

Verified by the same instance or process that produced the fix. Recorded as a limitation, not as assurance.

_None._

## Deferred (1)

| ID | Sev | Domain | Reachability | Impact | Title |
| --- | --- | --- | --- | --- | --- |
| PAY-BAL-001 | high | payment | conditionally-reachable | latent | deposit and balance payment requests have no subject-scoped ceiling because the stored final service price is null in production |

## Risk accepted (3)

| ID | Sev | Domain | Reachability | Impact | Title |
| --- | --- | --- | --- | --- | --- |
| HUB-GAL-002 | low | web | conditionally-reachable | theoretical | Gallery 'Import from URL' SSRF guard validates the resolved address before the request, not the address fetch() itself connects to (DNS-rebinding TOCTOU) |
| SEED-DEL-001 | low | database | unknown | historically-impacting | Map dataset cleanup hard-deleted 1,363 rows while the roadmap records the wave as soft-delete, and no deletion audit trail exists |
| SHOP-MIG-002 | low | database | currently-unreachable | latent | order_items.bundle_id is a single-column FK, not the composite artist-scoped FK the repo convention uses to make cross-artist rows unstorable |

## Mitigated but not fixed (3)

| ID | Sev | Domain | Reachability | Impact | Title |
| --- | --- | --- | --- | --- | --- |
| OPS-GIT-001 | medium | governance | directly-reachable | actively-impacting | Concurrent agents share one git index, so a bare commit captures another agent's staged work and attribution silently moves |
| OPS-GOV-001 | medium | governance | currently-unreachable | historically-impacting | A build agent violated an explicit stand-down order and committed to the shared checkout, including writes to the supervisor-only audit ledger |
| BILL-CONF-001 | low | billing | conditionally-reachable | latent | Durable purchase confirmation could silently ship without the inline Terms text on a fail-soft path |

## Verification blocked or impossible (0)

_None._

## Production reachability UNKNOWN (6)

Reachability was not established. These need production-state confirmation before they can be prioritized honestly.

| ID | Sev | Domain | Reachability | Impact | Title |
| --- | --- | --- | --- | --- | --- |
| DPIA-GAL-002 | medium | governance | unknown | latent | assertDpiaPreconditionsMet('gallery') has no callers anywhere in the live gallery path; recording the R3/R4/R6 gate keys enforces nothing on artist access |
| WHK-DSP-001 | medium | webhook | unknown | unknown | The charge.dispute.* handler exists in code but no artifact in the repository subscribes the endpoint to it, and the commit that added the handler changed no runbook |
| SEED-DEL-001 | low | database | unknown | historically-impacting | Map dataset cleanup hard-deleted 1,363 rows while the roadmap records the wave as soft-delete, and no deletion audit trail exists |
| WHK-EVT-001 | low | webhook | unknown | theoretical | event.account is asserted on one branch of five, event.livemode on none, and the one branch with no compensating check writes a caller-named booking_id straight into audit_log |
| BDEL-TGT-001 | informational | governance | unknown | unknown | DESIGN RECORD (not a defect): target billing-aware deletion flow, boundaries, schema, migration, test and rollback plan |
| TEST-VAC-009 | informational | testing | unknown | theoretical | The /legal/report 'DRIFT' test cannot fail on form-vs-action divergence, because both derive from one module; it guards a risk already eliminated by construction |

