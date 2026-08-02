<!-- GENERATED FILE - DO NOT EDIT.
     Source of truth: docs/audit/findings.yaml
     Regenerate:      pnpm audit:generate
     Edits here are overwritten and will fail `pnpm audit:check` in CI. -->

# Structural risk report

**Ledger content hash:** `0dfb2e433b87`  (sha256 of findings.yaml, first 12; deliberately not a clock or a git commit, see scripts/audit/generate.cjs)

> **This report is an evidence index and prioritization aid. It does not establish that
> unlisted areas are safe and does not replace an independent audit.**

## Executive summary

150 recorded finding(s), 4 structural pattern(s), across 98 mapped area(s).
126 remain open by remediation status. 121 are reachable (directly or conditionally) rather than latent.
123 have not passed independent verification.
187 analogous area(s) are flagged as plausibly affected but **not yet inspected**.

The register is deliberately incomplete. It records what has been examined, not what exists.

## Findings by severity

| Severity | Count |
| --- | --- |
| critical | 2 |
| high | 37 |
| medium | 67 |
| low | 40 |
| informational | 4 |

## Findings by remediation status

| Status | Count |
| --- | --- |
| accepted | 2 |
| deferred | 1 |
| fixed-unverified | 63 |
| in-progress | 5 |
| mitigated | 3 |
| not-applicable | 1 |
| open | 52 |
| risk-accepted | 2 |
| verified | 21 |

## Findings by verification status

| Verification | Count |
| --- | --- |
| not-started | 120 |
| partially-verified | 2 |
| passed | 27 |
| pending | 1 |

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

### PAT-003 — A PostgREST error is discarded, so a transient failure is indistinguishable from a legitimate empty result

**Assessment:** systemic · **Confidence:** high · **Status:** active · **Recurrences:** 5

supabase-js returns errors in the result object rather than throwing. The idiom `const { data } = await supabase...` therefore turns a failed read into a falsy `data`, which the surrounding branch reads as the legitimate business answer "there is nothing here". On a money or deletion path the handler then reports success, and because the caller is often a webhook or a cron there is no human to notice. The same shape recurs in three unrelated subsystems written at different times.

**Shared root-cause hypothesis (a hypothesis, not a conclusion):** HYPOTHESIS: the idiom is correct for reads where an empty result IS the answer, and is copied unchanged to reads where it is not. Nothing in review distinguishes the two cases, and no lint rule or type makes the omission visible. Not established: whether any instance has actually fired in production.

**Findings:** PAY-DEP-001, WHK-ERR-001, CRON-CLN-001, CRON-PRG-001, CRON-CCH-001

**Supporting evidence:**
- WHK-ERR-001: 17 of 23 Supabase calls in the 915-line deposit webhook omit `error`; the goods order flip at route.ts:718 then skips inventory, the confirmation email and the discount redemption, and returns 200 so Stripe never redelivers.
- PAY-DEP-001: the same class on the deposit path, found in production on 2026-07-21, and the reason AGENTS.md now carries the rule that a card deposit must never silently become manual.
- CRON-CLN-001, CRON-PRG-001, CRON-CCH-001: three independent instances in the cron endpoints, including a 7-year financial-retention lookup.
- The repo has already fixed instances twice with the reasoning written out: appointment-payment-intent.ts:439 "THE READ FAILED, SO WE DO NOT KNOW ANYTHING", and the P5d listCollectionsForArtist fix where a discarded error made productCount 0 and ENABLED a delete button on populated collections.

**Evidence that limits this pattern:** Not universal. The newer P9 cores capture and act on the error (appointment-payment-intent.ts:406 claimError, :449 afterError), and stripe-connect.ts:670 captures its UPDATE error. So the codebase demonstrably knows the correct shape; the pattern is about inconsistent application, not ignorance.

**Inspected, pattern NOT found:**
- apps/web/src/lib/server/appointment-payment-intent.ts (captures both errors)
- apps/web/src/lib/stripe-connect.ts:670-682 (captures the UPDATE error)

**Comparable areas NOT yet inspected:**
- apps/web/src/app/api/email/webhook/route.ts
- apps/web/src/lib/order-fulfillment.ts
- apps/web/src/lib/server/discounts.ts recordDiscountRedemption
- every remaining /api/mobile/* route

**Suggested auditor sampling:**
- grep for `const { data }` with no `error` across apps/web/src and classify each by whether an empty result is a legitimate answer
- every handler that returns 200 unconditionally

### PAT-004 — A database read whose error is never bound, degrading silently to a plausible empty value that the caller then acts on

**Assessment:** systemic · **Confidence:** confirmed · **Status:** active · **Recurrences:** 9

The single most productive defect shape in this repository. A Supabase call is destructured as `const { data } = ...` with no `error` binding, and the result is immediately coalesced with `?? 0`, `?? []`, `?? null` or `?? {}`. A failed read becomes indistinguishable from a legitimate empty result and the caller proceeds on it. NINE confirmed defects in a single day across five subsystems, with consequences ranging from a wrong dashboard number to permanent data loss to an authentication bypass. A codebase-wide sweep then found roughly 448 instances across 175 files, of which about 68 act on the bad value on a money, entitlement, authorization or deletion path. Two properties let it survive review: the failure produces a plausible VALUE rather than an exception, so nothing distinguishes it at runtime; and the coalescing operator that causes it reads as defensive programming, so a reviewer-s eye passes over it as a good habit. The question that finds it is not -is this error handled- but -is a failed read here distinguishable from a legitimate empty result, and does the difference matter-.

**Shared root-cause hypothesis (a hypothesis, not a conclusion):** Supabase-s client returns errors as VALUES rather than throwing, so forgetting to bind `error` is syntactically invisible and costs nothing at the call site. The language then supplies `??`, which converts the resulting undefined into a domain-plausible default. Neither step looks wrong in isolation and together they convert every transient failure into a confident wrong answer. Compounding it: in most of these call sites the empty result is a GENUINELY legitimate outcome (no prior refunds, no gallery images, no MFA enrolled), so the correct handling of the legitimate case is what makes the failure case invisible.

**Findings:** FEE-DSP-002, BDEL-PAY-002, PAY-RFD-011, GOODS-SET-001, GAL-REL-001, AUTH-MFA-001

**Supporting evidence:**
- FEE-DSP-002: a select on a column that never existed returned 42703 on every call for the life of the feature; the discarded error made the whole goods lane report zero.
- GOODS-SET-001: a read-modify-write where the collapsed merge base is PERSISTED, destroying the artist-s bio page, booking settings and theme. The only instance that loses data.
- AUTH-MFA-001: the MFA step-up gate, live in production, with two fail-open paths in nine lines, found by two agents independently who each assumed the other file backstopped it.
- GAL-REL-001: a counsel-mandated compliance control that marks itself complete and excludes the artist from every future retry, because a failed read looks exactly like an artist with no images.
- Sweep totals, 5 parallel read-only agents over 175 files: ~448 instances, ~113 harmless, ~267 wrong-but-visible, 68 acting on the bad value on a critical path.
- A 13-file cluster of the JSONB read-merge-write variant, one of which can silently REOPEN a closed artist-s books as a side effect of an unrelated save.


## Most affected domains

| Domain | Findings |
| --- | --- |
| payment | 34 |
| billing | 14 |
| jobs | 14 |
| webhook | 14 |
| web | 13 |
| database | 12 |
| testing | 8 |
| data-retention | 6 |
| authorization | 5 |
| migration | 5 |
| public-surface | 5 |
| governance | 4 |
| production-config | 3 |
| analytics | 2 |
| ci-cd | 2 |
| secrets | 2 |
| tooling | 2 |
| api | 1 |
| auth | 1 |
| entitlement | 1 |
| logging | 1 |
| storage | 1 |

## Findings with production reachability

| ID | Severity | Reachability | Impact | Title |
| --- | --- | --- | --- | --- |
| PAY-DEP-001 | critical | directly-reachable | historically-impacting | A Stripe failure silently converted a card deposit into a manual one, producing a booking with no pay button; the first fix re-opened the same silent degradation |
| ABUSE-PUB-001 | high | directly-reachable | latent | The public project intake server action has none of the five abuse controls its direct sibling, the public booking intake, applies — no honeypot, no origin check, no rate limit, no image MIME allowlist and no dedupe |
| AUTH-MFA-001 | high | directly-reachable | reachable-no-known-impact | The MFA step-up gate fails OPEN on a transient failure, in production, and the page it redirects to fails open in the same direction |
| AUTH-RLS-001 | high | directly-reachable | historically-impacting | product_collections shipped RLS-enabled with a SELECT-only policy while every write runs on the user-scoped client |
| AUTH-RLS-002 | high | directly-reachable | historically-impacting | discount_codes had the identical SELECT-only RLS defect, live in production on the revenue path, from 0118 until 2026-07-29 |
| AUTH-RLS-003 | high | directly-reachable | latent | product_collections RLS DELETE policy allows artists to bypass delete_collection_if_eligible safety check, cascade-deleting populated collection items |
| BDEL-PAY-001 | high | directly-reachable | latent | Account deletion does not archive or pseudonymize P9 appointment payment data before the cascade destroys it |
| BDEL-PAY-002 | high | conditionally-reachable | latent | Account deletion's deposit read discarded its error, so a transient read failure let deletion proceed as though the artist had no deposits at all |
| BDEL-RET-001 | high | conditionally-reachable | latent | Terms and Privacy promise post-deletion retention of billing and tax records that the cascade destroys, and the retained archive has no field for any of them |
| BDEL-SUB-001 | high | conditionally-reachable | latent | Confirms and extends BILL-ENT-002: deletion never touches the subscription, and the cascade is now empirically shown to destroy billing_subscriptions and billing_consent_records |
| BDEL-TTS-001 | high | conditionally-reachable | latent | An append-only trigger on transaction_tax_snapshots aborts the profiles cascade, so account deletion fails permanently after irreversibly cancelling the client's deposit PaymentIntents |
| BILL-ENT-002 | high | conditionally-reachable | latent | OPEN: account deletion cancels PaymentIntents but never the subscription, and all nine billing/tax tables cascade-delete with the profile |
| CRON-CLN-001 | high | conditionally-reachable | latent | cleanup discards the error from the 7-year financial-retention lookup, so a transient failure deletes bookings carrying financial records |
| CRON-RMD-001 | high | directly-reachable | actively-impacting | Deposit-overdue reminder re-sends to the same customer every day forever; one production recipient has received 46 |
| DATA-MIG-001 | high | directly-reachable | historically-impacting | `migration repair --status applied` on 2026-04-20 marked 0001_rls_policies.sql applied without running it, leaving 6 core tables with RLS disabled in production for ~3 weeks |
| DATA-RACE-001 | high | directly-reachable | reachable-no-known-impact | READ COMMITTED single-statement snapshots defeated two separate safety mechanisms, each shipped with a written claim of atomicity that had never been executed |
| DRIFT-ENUM-001 | high | conditionally-reachable | latent | Production's order_status enum holds a mangled label `cancel\r\n  led` instead of `cancelled`, so 'cancelled'::order_status is not a valid value in production |
| GAL-REL-001 | high | conditionally-reachable | latent | The C1.5 gallery relocation control silently and PERMANENTLY self-disables on a transient read failure, leaving client photographs public |
| GOODS-SET-001 | high | directly-reachable | latent | A discarded read in a read-modify-write DESTROYS the artist's entire settings blob, and being a write it does not self-heal |
| PAY-AUTHZ-001 | high | conditionally-reachable | latent | refundDepositCore refunded whatever PaymentIntent the booking row named, without ever checking the intent belonged to the caller - and the pattern is LIVE ON PRODUCTION |
| PAY-AUTHZ-002 | high | conditionally-reachable | latent | refundGoodsOrderCore had the same defect, and the attacker authors the order_items the refund amount is computed from |
| PAY-BAL-001 | high | conditionally-reachable | latent | deposit and balance payment requests have no subject-scoped ceiling because the stored final service price is null in production |
| PAY-CONN-001 | high | directly-reachable | historically-impacting | Cached Connect state asserted a routing capability Stripe denied, and the first corrective predicate was broad enough to downgrade the entire artist fleet on one platform-scope fault |
| PAY-ORD-001 | high | conditionally-reachable | latent | The refund ordering guard compares a second-granularity clock with a strict `<`, so a stale `charge.refunded` created in the same second as the newest one is applied and walks the recorded refund backwards |
| PAY-ORD-002 | high | conditionally-reachable | latent | A `payment_intent.succeeded` cannot move a request out of `failed`, so a collection recorded after a payment_failed on the same intent leaves the request permanently `failed` with the money already allocated, and says nothing |
| PAY-RFD-001 | high | conditionally-reachable | latent | A fully refunded appointment payment request still reads `paid`: the refund converges the money and never moves the request's status |
| PAY-RFD-011 | high | conditionally-reachable | latent | The refund path cannot tell a failed payment_collections read from an absent row, and the fallback can retain processor cost from the buyer twice |
| PAY-SPON-001 | high | directly-reachable | historically-impacting | Sponsorship waivers were released against PaymentIntent metadata (intent) rather than what settlement actually booked, erasing other bookings' real cap usage; and the first webhook release added a delta instead of converging to a target |
| SHOP-ORD-002 | high | conditionally-reachable | latent | The 24h stale-order sweep cancels the ORDER but leaves the PaymentIntent live and payable: a buyer paying after the sweep is charged with no order, no inventory, no receipt and no artist visibility |
| TEST-VAC-001 | high | directly-reachable | historically-impacting | Tests incapable of failing, found in at least five independent rounds, including the suite written specifically to prove an RLS repair |
| WEB-XSS-001 | high | conditionally-reachable | latent | Stored XSS on the public /studios/[slug] page: JSON-LD emitted with raw JSON.stringify into dangerouslySetInnerHTML, bypassing the repo's own escaper |
| WHK-ERR-001 | high | directly-reachable | unknown | 17 of 23 Supabase calls in the deposit webhook discard the error, and the handler then returns HTTP 200, so Stripe never redelivers and the skipped money work is permanently lost |
| WHK-TOK-001 | high | directly-reachable | latent | The customer's magic-link token is rotated inside the atomic settlement flip, then delivered by an email path that swallows every error and can never be retried |
| BDEL-CON-001 | medium | directly-reachable | latent | Counsel decision 7 on the Connected Account is half implemented: the pointer is retained but the scheduled account deletion at window-end was never built, and the pointer is purged at seven years |
| BDEL-RET-002 | medium | conditionally-reachable | latent | The 0129 retention repair created the inverse gap: five billing tables now survive account deletion INDEFINITELY because nothing purges them |
| BILL-BST-001 | medium | conditionally-reachable | latent | The deleted-profile safe branch never advances last_reconciled_at, so every dead row is re-picked forever and can STARVE the backstop that exists to catch lost webhooks |
| BILL-ENT-001 | medium | directly-reachable | reachable-no-known-impact | OPEN: creating a live Stripe Connect account is gated on auth and rate limit but not on entitlement |
| BILL-UI-001 | medium | directly-reachable | latent | A completed statutory withdrawal does not revalidate anything, so /settings/plan keeps rendering the artist as an active Plus subscriber after their contract has ended and their refund has been issued |
| BILL-UI-002 | medium | directly-reachable | reachable-no-known-impact | Consumer Plus checkout showed 3 of 4 Art. 8(2) elements adjacent to the order button; main service characteristics sat above the panel |
| BUNDLE-RLS-001 | medium | conditionally-reachable | latent | 0138's variant-ownership RLS check was a TAUTOLOGY: the unqualified column resolved to the subquery's own table, so the clause proved only that the variant exists |
| CRON-CAP-001 | medium | conditionally-reachable | latent | The per-artist 10-email daily cap is consumed in branch order, and a capped appointment reminder is lost rather than deferred |
| CRON-COV-001 | medium | conditionally-reachable | unknown | coverage-worker has no run-level mutual exclusion and its real cadence comes from a GitHub Actions schedule against production, making overlap plausible for the non-task work |
| CRON-GRW-001 | medium | directly-reachable | historically-impacting | The daily growth snapshot has two permanent unrecoverable gaps and nothing detects or backfills a missed run |
| CRON-IGX-001 | medium | directly-reachable | latent | instagram-refresh marks an account disconnected on ANY thrown error, including a transient Meta outage |
| CRON-OBS-001 | medium | directly-reachable | actively-impacting | No cron endpoint reports to Sentry; a missed or failed run is invisible, and two misses already went unnoticed |
| CRON-PRG-001 | medium | directly-reachable | unknown | The 30-day reference-image purge is non-paginated, non-recursive and error-discarding, and it is named as the safety net for a purge path that deliberately does not throw |
| CRON-SEC-001 | medium | conditionally-reachable | latent | One CRON_SECRET authorises eleven endpoints including bulk deletion and customer email, and doubles as the Instagram OAuth state signing key |
| CRON-TOK-001 | medium | conditionally-reachable | latent | Reconfirmation rotates the customer's magic-link token before sending the email, so a crash between the two permanently locks the customer out |
| DATA-MIG-002 | medium | conditionally-reachable | latent | 68 `create table if not exists` blocks declare constraints inline, so the documented non-convergence footgun is systemic — and the 0122 remediation that produced the footgun entry is itself partial |
| DATA-MIG-003 | medium | conditionally-reachable | theoretical | Two migrations state that Supabase default privileges grant service_role EXECUTE; measured, the privilege comes from PUBLIC, so `revoke ... from public` silently removes it in production |
| DRIFT-ACT-001 | medium | directly-reachable | actively-impacting | Two independent implementations of saveBooksSettingsAction are both wired to live forms, and they disagree about whether opening or closing the books is audited |
| DRIFT-NN-001 | medium | conditionally-reachable | latent | Production's founding_artist_applications lacks 5 NOT NULL constraints that migration 0056 declares, because 0056 was written retroactively to describe a table production already had |
| FEE-DSP-001 | medium | conditionally-reachable | latent | The artist-facing fee DISPLAY path is tier-blind: four surfaces render PLATFORM_FEE_BPS (flat 3%) while the charged rate is tier-resolved, diverging for two of three tiers the moment fee schedule v2 activates |
| FEE-DSP-002 | medium | directly-reachable | actively-impacting | The artist fee-savings goods lane has been dead since it shipped: a column that does not exist, an error nobody read, and a double-count hiding underneath it |
| FEE-STP-001 | medium | conditionally-reachable | latent | Settlement stamps the fee schedule VERSION but not the resolved TIER, so under v2 a stored (version, base) pair cannot reproduce the charged fee; the appointment-payment lane stamps the version only into the audit log, and the deposit lane stamps it at settlement time rather than from the intent |
| GOODS-DISC-001 | medium | directly-reachable | latent | The C1.1/C1.2/C1.3 checkout disclosures (seller identity, custom-made return exemption, durable-record receipt) were built ONLY for the standalone shop checkout; the appointment add-on checkout (booking-deposit flow) can sell the exact same custom-made product with none of them |
| GOODS-VAR-001 | medium | conditionally-reachable | latent | reconcileVariants would hard-delete a variant sold ONLY inside a bundle, stranding the sale's snapshot and silently breaking its refund restock |
| HUB-GAL-001 | medium | conditionally-reachable | latent | image_gallery entitlement enforced only at render, not at save, so a Free artist could persist Plus gallery blocks |
| HUB-GAL-004 | medium | conditionally-reachable | latent | isPrivateIpv6 has proven coverage holes (v4-mapped hex, v4-compatible, NAT64 forms all ALLOWED), fails OPEN on garbage against its own doc comment, and the IPv6-literal branch is dead only by accident of URL bracket handling |
| HUB-GAL-008 | medium | conditionally-reachable | latent | The IPv6 blanket refusal breaks Import-from-URL for most real image hosts, and the comment justifying it asserted the opposite without measuring |
| HUB-GAL-009 | medium | directly-reachable | latent | A downgraded artist's gallery images stayed publicly fetchable forever: the entitlement gate hid the RENDER, never the objects |
| MAP-SSRF-001 | medium | conditionally-reachable | latent | The map coverage ingest fetched third-party URLs behind a hostname check that never resolved DNS, while the hardened resolving guard sat one import away |
| MIG-DROP-001 | medium | conditionally-reachable | latent | Bare `drop constraint` without `if exists` means several migrations cannot repair a dropped constraint, including one already applied in production |
| OPS-CIX-001 | medium | directly-reachable | actively-impacting | The legal-artifact gate and the new path-resolution test are runnable everywhere but enforced nowhere |
| OPS-GIT-001 | medium | directly-reachable | actively-impacting | Concurrent agents share one git index, so a bare commit captures another agent's staged work and attribution silently moves |
| OPS-TOOL-001 | medium | directly-reachable | actively-impacting | Ten governance scripts hardcode the absolute Windows path A:/WORK/inklee, so none can run in CI or on any other machine |
| PAY-AUTHZ-003 | medium | conditionally-reachable | latent | The appointment refund read allocations and updated payment_collections keyed on the intent id alone, held up only by an undocumented accident |
| PAY-CHK-001 | medium | conditionally-reachable | latent | prepareCheckoutAction deletes orphaned order on failure without verifying concurrent state |
| PAY-RFD-003 | medium | conditionally-reachable | latent | Artist refund route lets the artist choose the fee-refund case, controlling Inklee's fee |
| PAY-RFD-004 | medium | conditionally-reachable | latent | Refund idempotency key contains Date.now(), so a retry creates a second Stripe refund |
| PAY-RFD-007 | medium | conditionally-reachable | latent | No artist self-serve refund path for money collected on a cancelled/expired/failed request |
| PAY-RFD-008 | medium | conditionally-reachable | latent | refundDepositCore now issues a PARTIAL Stripe refund with refund_application_fee, and has no test of any kind; the platform fee it returns is proportional to the amount, not to the deposit lane |
| PAY-RFD-009 | medium | conditionally-reachable | latent | The appointment by-line refund summed each selected line's FULL original allocation every call, so re-selecting an exhausted line over-refunded by misattribution |
| PAY-RFD-010 | medium | conditionally-reachable | latent | The appointment refund's idempotency key omitted the line selection the goods path deliberately fingerprints, and the ledger insert that caught the collision was swallowed, so the artist was told a refund succeeded while Stripe moved nothing |
| PAY-WHK-002 | medium | conditionally-reachable | latent | charge.refunded treated an AMBIGUOUS booking lookup as absence: two rows claiming one intent silently skipped the sponsorship release and the double-refund guard |
| SEED-GRT-001 | medium | directly-reachable | latent | seed.sql re-grants ALL on ALL public tables to anon and authenticated after every local reset, clobbering the migrations' REVOKEs; its hand-maintained mirror list misses 0067, so two growth views are wide open locally and correctly locked in production |
| SEED-GRT-002 | medium | directly-reachable | latent | seed.sql mirrors payment_allocations REVOKE from 0125 but omits payment_collections REVOKE, leaving local stack with authenticated TRUNCATE on a service-role-only table |
| SHOP-DROP-001 | medium | conditionally-reachable | latent | The product drop gate is bypassed for products sold inside a bundle: bundlePurchasable consults only stock, so an undropped product refused for direct purchase is obtainable via any bundle containing it |
| SHOP-DROP-002 | medium | conditionally-reachable | latent | The drop gate was absent from the PAYABLE add-on read while present on the display read beside it, so an undropped product was sellable where it was refused everywhere else |
| SHOP-FUL-003 | medium | conditionally-reachable | latent | Settlement still calls the throwing expansion AFTER the paid flip: a snapshot read failure on a paid bundle order permanently skips inventory decrement (oversell), the exact shape SHOP-FUL-002 fixed on the refund side |
| SHOP-FUL-004 | medium | conditionally-reachable | latent | Post-flip WRITE failures on the refund path are silently swallowed: restockInventory ignores its PostgREST errors and the redemption delete's result is discarded, losing restock and/or cap release with the flip consumed and no observability |
| SHOP-GATE-001 | medium | conditionally-reachable | latent | The standalone shop checkout ignores the artist's own goods-module switch: neither canUseGoods nor any module visibility gates the page, the action or the money-path core |
| SHOP-ORD-001 | medium | conditionally-reachable | latent | A standalone goods order abandoned at the payment step stays pending forever: no webhook branch and no cron sweep can ever reach it |
| SHOP-VAR-001 | medium | conditionally-reachable | latent | Bundles cannot express variants, and nothing guards the gap: a variant-stocked product inside a bundle sells with no variant chosen and no stock moved |
| SHOP-VIS-001 | medium | conditionally-reachable | latent | The standalone shop lists and sells products the artist marked NOT publicly visible: is_public_visible is filtered by the public artist page but by neither of the two new standalone-checkout reads |
| TEST-VAC-002 | medium | directly-reachable | latent | The goods-refund suite's once-only restock guarantee cannot fail: moving restockInventory outside the flip gate leaves the whole suite green |
| TEST-VAC-003 | medium | directly-reachable | latent | The standalone checkout's discount arithmetic has no effective coverage: neither the fee base nor the amount the buyer is CHARGED can be broken by a test |
| WHK-DEA-001 | medium | conditionally-reachable | latent | The deauthorize branch's own comment claims re-onboarding overwrites the stored Connect id; ensureConnectAccount returns it unchanged, and AGENTS.md says the opposite of the comment |
| WHK-RFD-001 | medium | directly-reachable | latent | charge.refunded records at most one audit row per booking carrying the first cumulative amount, so a partial refund is indistinguishable from a full one and later partials are never recorded |
| WHK-RTY-001 | medium | directly-reachable | unknown | The file identifies Stripe endpoint auto-disabling as a hazard in one branch and then returns 4xx from six other branches for permanently unsatisfiable conditions |
| WHK-SPN-001 | medium | conditionally-reachable | latent | A failed sponsorship booked-stamp after a SUCCESSFUL increment leaves the cap permanently over-consumed, and the comment asserting otherwise only covers the other case |
| BDEL-STE-001 | low | directly-reachable | reachable-no-known-impact | profiles already carries account_status, deleted_at, deleted_by, suspended_at and suspended_reason, but account_status enforces nothing outside admin surfaces |
| BILL-CONF-001 | low | conditionally-reachable | latent | Durable purchase confirmation could silently ship without the inline Terms text on a fail-soft path |
| BILL-UI-003 | low | conditionally-reachable | latent | Consumer Plus checkout fail-safe path defers the total price to Stripe Checkout, off the order screen |
| COPY-UI-001 | low | directly-reachable | actively-impacting | Two em-dashes in user-visible checkout copy on the screen where a consumer commits to a recurring charge, plus a yearly option that renders only for a cohort that does not exist |
| CRON-AUT-001 | low | directly-reachable | theoretical | Seven of eight cron endpoints use a plain string comparison for the bearer secret while the repo's own timing-safe helper is used by exactly one |
| CRON-CCH-001 | low | conditionally-reachable | latent | Module-scope artist caches are never invalidated and cache a swallowed profile-read failure for the whole run |
| CRON-TZO-001 | low | conditionally-reachable | latent | Reminder candidate windows are computed in server-local time while the match is computed in artist time, so far-western artists silently never receive minimum-day reminders |
| DATA-ORPH-001 | low | conditionally-reachable | latent | createProductAction inserts the product row before processing images and returns the image error without deleting it, so every failed image upload leaves an untitled-to-the-artist orphan product that still consumes the plan's active-product cap |
| DATA-RACE-002 | low | conditionally-reachable | latent | 0124's self-documented residual risks (timeout and deadlock) not recorded in the audit evidence register |
| DRIFT-FN-001 | low | directly-reachable | reachable-no-known-impact | Production's map_search body and idx_map_locations_city_trgm expression differ from committed migration 0097, which documents in its own header that it was hand-applied to production |
| HUB-DST-001 | low | conditionally-reachable | latent | The FD8 destination formula called the standalone shop AVAILABLE while the platform park switch was off, so a brand-new goods block defaulted to a public link to a 404 with no editor warning, and the visibility summary reported the artist as published |
| HUB-GAL-002 | low | conditionally-reachable | theoretical | Gallery 'Import from URL' SSRF guard validates the resolved address before the request, not the address fetch() itself connects to (DNS-rebinding TOCTOU) |
| HUB-GAL-005 | low | conditionally-reachable | latent | URL credentials are not rejected: userinfo in an artist-supplied import URL is transmitted to the third-party host while the SSRF guard sees only the clean hostname |
| HUB-GAL-006 | low | conditionally-reachable | latent | The hosted-logos marker single-sourcing is incomplete: a second literal survives in mobile-goods-server.ts while the parser comment claims the drift risk was closed |
| HUB-GAL-007 | low | directly-reachable | latent | An image uploaded but never saved is an orphan no cleanup can see: removeDroppedHubImages diffs PERSISTED state against saved state, so a file that never reached a save has no prior state to be dropped from |
| OBS-MAP-001 | low | directly-reachable | actively-impacting | Public-map analytics plane has recorded zero events and one pageview since the 2026-07-27 launch; silence cause indistinguishable from repo+DB evidence |
| OPS-CFG-001 | low | directly-reachable | reachable-no-known-impact | The grandfathering backfill defaults ADMIN_EMAILS to a hardcoded personal address; the application's admin guard has no default at all |
| OPS-CRD-001 | low | conditionally-reachable | latent | RISK INTRODUCED BY THIS REMEDIATION: an exported DATABASE_URL now outranks apps/web/.env.local in every governance recorder |
| OPS-ERR-001 | low | directly-reachable | actively-impacting | Raw Postgres error messages are returned to clients from 91 call sites — 60 in the mobile JSON API and 31 in web server actions |
| OPS-LINT-001 | low | directly-reachable | actively-impacting | packages/shared is linted by nothing, so 'lint 0 errors' has always been vacuous for 78 files including all the money math |
| PAY-AUD-001 | low | directly-reachable | reachable-no-known-impact | audit_log counts paid deposits 5x under booking_requests: only the webhook path writes deposit_paid audit rows, the manual-mark path does not |
| PAY-FEE-003 | low | conditionally-reachable | theoretical | The fee-actuals write is the only write on the settlement path with no ordering guard and no derivation from stored state, so a later delivery overwrites it from whatever its payload says |
| PAY-UI-006 | low | directly-reachable | latent | Payments list UI cancel-button state set drifted from the core's authorization constant |
| SHOP-FUL-001 | low | conditionally-reachable | latent | Settlement and refund disagree on which order_items reach inventory: settle passes ALL lines to decrementInventory while refund restocks only type='product' |
| SHOP-FUL-002 | low | conditionally-reachable | latent | A bundle-snapshot read failure during a FULL goods refund permanently loses the restock, the discount-redemption release and the audit row, because the throw lands after the once-only flip has been consumed and no retry can re-enter |
| SHOP-FUL-005 | low | conditionally-reachable | latent | A settle that returns false answers Stripe 200, so recovery from a pre-flip refusal falls entirely to the daily sweep: worst case roughly two days with money captured and the order still pending |
| SHOP-ORD-003 | low | conditionally-reachable | latent | The intent-aware sweep is unbounded and serial inside a cron with no maxDuration, and skipped rows never reach the audit payload |
| SHOP-VIS-002 | low | conditionally-reachable | latent | A product hidden from the public shop is still sellable through the appointment add-on checkout, which contradicts the decision already settled for the shop reads |
| WHK-CUR-001 | low | conditionally-reachable | theoretical | The currency anti-tamper backstop is switched off for the combined deposit-plus-goods lane |
| OPS-DOC-001 | informational | directly-reachable | reachable-no-known-impact | Twelve tracked docs still instruct the reader to cd into a machine-absolute path that exists on one computer |

## Findings awaiting verification

| ID | Severity | Remediation | Verification | Fix commit |
| --- | --- | --- | --- | --- |
| AUTH-RPC-001 | critical | fixed-unverified | not-started | 364a10f |
| PAY-DEP-001 | critical | fixed-unverified | not-started | 7e59c79 |
| AUTH-MFA-001 | high | fixed-unverified | not-started | 63262398 |
| BDEL-PAY-001 | high | fixed-unverified | not-started | 7071ac08 |
| BDEL-PAY-002 | high | fixed-unverified | not-started | 40191929 |
| BDEL-RET-001 | high | fixed-unverified | not-started | 7071ac08 |
| BDEL-SUB-001 | high | fixed-unverified | not-started | c39b6a0e |
| BDEL-TTS-001 | high | fixed-unverified | not-started | - |
| CRON-CLN-001 | high | fixed-unverified | not-started | 9a7c3536 |
| CRON-RMD-001 | high | fixed-unverified | not-started | 9a7c3536 |
| DATA-MIG-001 | high | fixed-unverified | not-started | 31f320c |
| PAY-AUTHZ-001 | high | fixed-unverified | not-started | 8db7b2dc |
| PAY-AUTHZ-002 | high | fixed-unverified | not-started | 8db7b2dc |
| PAY-CONN-001 | high | fixed-unverified | not-started | 7e59c79 |
| PAY-FEE-002 | high | fixed-unverified | not-started | - |
| PAY-ORD-002 | high | fixed-unverified | not-started | - |
| PAY-RFD-002 | high | fixed-unverified | pending | bdfc132 |
| PAY-RFD-011 | high | fixed-unverified | not-started | 7dd103ed |
| PAY-RLS-005 | high | fixed-unverified | not-started | 6fb2eb1 |
| PAY-SPON-001 | high | fixed-unverified | not-started | edb99fb |
| PAY-WHK-001 | high | fixed-unverified | not-started | - |
| WEB-XSS-001 | high | fixed-unverified | not-started | 8db7b2dc |
| WHK-COLL-001 | high | fixed-unverified | not-started | - |
| BDEL-RET-002 | medium | in-progress | not-started | eb1b8aed |
| BILL-ENT-001 | medium | fixed-unverified | not-started | - |
| BILL-UI-001 | medium | fixed-unverified | not-started | 45a44bee |
| BILL-UI-002 | medium | fixed-unverified | passed | 8e75dcc |
| CRON-IGX-001 | medium | fixed-unverified | not-started | 9a7c3536 |
| DATA-MIG-002 | medium | fixed-unverified | not-started | 201fbfc |
| FEE-DSP-002 | medium | fixed-unverified | not-started | 1b8671fc |
| FEE-STP-001 | medium | fixed-unverified | partially-verified | 0adf56ca |
| GOODS-DISC-001 | medium | fixed-unverified | not-started | b036075e |
| GOODS-VAR-001 | medium | fixed-unverified | not-started | 88c9e544 |
| HUB-GAL-001 | medium | fixed-unverified | not-started | cb8ec83 |
| HUB-GAL-004 | medium | fixed-unverified | not-started | 6bac9914 |
| HUB-GAL-008 | medium | fixed-unverified | not-started | c3d7ae49 |
| HUB-GAL-009 | medium | fixed-unverified | not-started | a56548ce |
| MAP-SSRF-001 | medium | fixed-unverified | not-started | c3d7ae49 |
| OPS-TOOL-001 | medium | fixed-unverified | not-started | 45a44bee |
| PAY-AUTHZ-003 | medium | fixed-unverified | not-started | 3d308203 |
| PAY-FEE-004 | medium | fixed-unverified | not-started | e698be7 |
| PAY-RFD-003 | medium | fixed-unverified | passed | 6fb2eb1 |
| PAY-RFD-004 | medium | fixed-unverified | passed | 6fb2eb1 |
| PAY-RFD-007 | medium | fixed-unverified | passed | 752e989 |
| PAY-RFD-009 | medium | fixed-unverified | not-started | c3699793 |
| PAY-RFD-010 | medium | fixed-unverified | not-started | 01003200 |
| PAY-WHK-002 | medium | fixed-unverified | not-started | 3d308203 |
| SEED-GRT-002 | medium | fixed-unverified | not-started | - |
| SHOP-DROP-002 | medium | fixed-unverified | not-started | 006c3ac9 |
| SHOP-FUL-004 | medium | fixed-unverified | not-started | b483efc7 |
| TEST-VAC-004 | medium | fixed-unverified | not-started | 5fa0110e |
| TEST-VAC-006 | medium | fixed-unverified | not-started | 5fa0110e |
| TEST-VAC-007 | medium | fixed-unverified | not-started | 5fa0110e |
| BILL-UI-003 | low | fixed-unverified | not-started | eb91f1c |
| COPY-UI-001 | low | fixed-unverified | not-started | 45a44bee |
| HUB-DST-001 | low | fixed-unverified | not-started | b2da53c7 |
| HUB-GAL-005 | low | fixed-unverified | not-started | 6bac9914 |
| HUB-GAL-006 | low | fixed-unverified | not-started | 6bac9914 |
| OPS-LINT-001 | low | fixed-unverified | not-started | 45a44bee |
| PAY-UI-006 | low | fixed-unverified | passed | 752e989 |
| SHOP-FUL-005 | low | fixed-unverified | not-started | 5fa0110e |
| SHOP-ORD-003 | low | fixed-unverified | not-started | 5fa0110e |
| TEST-VAC-005 | low | fixed-unverified | not-started | 5fa0110e |
| TEST-VAC-008 | low | fixed-unverified | not-started | 01003200 |

## Analogous areas flagged but NOT inspected

These are the register's highest-value entries for an auditor: places a recorded weakness could plausibly also exist, where nobody has looked.

- /api/admin/seed-coverage and /api/admin/seed-country reach the same pipeline behind the same secret.
- /pricing's hardcoded yearly price (the other half of C2) was NOT read by me.
- 0079_claim_flow.sql and 0125 are mirrored in seed.sql; whether the mirrors are FAITHFUL to the migrations (rather than merely present) was not verified line by line.
- 0095, 0096 and 0098 are named by DATA-MIG-001 as also applied out of band and repaired into the ledger. They produced no unexplained deviation in this diff, but their bodies were only compared by whitespace-collapsed hash, which would not catch a difference the diff engine classified as branch-ahead or cascade.
- 0115 (projects), 0116 (fee_actuals), 0117 (project_client_portal), 0119 (product_drops_preorders) were not policy-vs-client audited by me.
- 0118's SELECT policies carry no `TO` clause so they bind PUBLIC including anon; whether anon holds a table-level GRANT was NOT checked against a live catalog.
- 0125 may have other grant/revoke pairs that are not mirrored. A systematic diff of all 0125 privilege statements against seed.sql was not performed.
- AGENTS.md and DATA-MIG-001 note 0095-0098 were also applied out of band and then repaired into the ledger. 0097 is confirmed divergent (DATA-DRIFT-004). 0095, 0096 and 0098 were compared as part of the whole-catalog diff and produced no unexplained deviation, but their SQL text was not read line by line against production.
- All other enums consumed by the mobile app (booking_status, booking_mode, etc.) have not been audited for the same wire-change risk.
- Any OTHER place in the codebase that fetches an artist- or attacker-influenced URL server-side was not exhaustively re-surveyed for this finding beyond the two files cited (which WERE inspected, not merely guessed-at); a repo-wide grep for `fetch(` sites that take a variable (not a literal) URL would be the next inspection to run before treating this class as closed.
- Any admin/reconciliation tooling that could repair fee_sponsored_used_cents
- Any future `project_id`-subject P9 intent reaching this endpoint
- Any future charge.dispute.* handler (A5), which will meet the same seam with the same clock.
- Any other caller that rotates customer_token_hash was not enumerated.
- Any other durable-medium artifact composed with a fail-soft read (none found in the withdrawal/cancellation branches, but not swept repo-wide).
- Any other server-side fetch of externally-controlled content that reads a body into memory (none currently exist for artist/third-party-supplied URLs besides this feature; see HUB-GAL-002's analogous-areas note) should be checked for the same buffer-then-check-size mistake if one is added later.
- Any other table added after account-deletion.ts that has ON DELETE CASCADE from profiles and contains financial or legally-retainable data.
- Any other token-gated public read (booking_requests, waitlist, pay tokens) should be re-checked for a real hash-equality predicate vs a not-null predicate.
- Bundles: 0132_product_bundles.sql:61-62 gives product_bundles its own is_public_visible mirroring product_collections. Slice C4 (payable bundles) is not yet written; the same omission would land there. NOT inspected.
- Commit edb99fb (2026-07-21) records that 0095-0098 ALSO had to be repaired into the ledger because 'they had been applied by another session via direct SQL and were unrecorded' — a second, later ledger/reality divergence, in the safe direction. Whether other silent divergences exist was NOT checked against a live catalog.
- Every /api/mobile/* route relies on requireMobileUser and none of the routes I read carries a rate limit except events/route.ts and settings/connect-link/route.ts. The authenticated-but-unthrottled write routes (goods, travel, booking-form fields) were not assessed for abuse volume.
- Every other RLS policy whose WITH CHECK contains an `exists` subquery over a table that shares a column name with the policy's own table. Not swept. This is the highest value follow-up from this finding, because the defect class is invisible to reading.
- Every other `revoke execute ... from public` in the migration set was NOT enumerated. Any function whose only caller is the service role and which revokes from PUBLIC without an explicit service_role grant has the live version of this defect.
- Every other caller of a deliberately-throwing helper placed after a once-only conditional update was NOT enumerated.
- Every other fixture divergence between the local stack and production: seed.sql also runs ALTER DEFAULT PRIVILEGES (lines 27-30), so future objects created locally differ too, and pg_default_acl was not diffed.
- Every other migration file has not been swept for this shape. Assigned to the reviewer that found it, split into applied (cannot edit, correct the claimed repair path) and unapplied (fixable).
- Every other object created by 0036 and 0037 was compared and matched; objects created by migrations applied out of band that this pass could not attribute were not separately enumerated.
- Every other place a plpgsql RPC writes a row and a TypeScript caller then reads that row back through PostgREST with a different filter: `delete_collection_atomic` (0124) and `send_payment_request` (0126) were not inspected for this shape.
- Every other table created since 0035 with `enable row level security` — I did not enumerate policy-vs-writing-client across the full table set.
- Every other test file in the repo using this same queue/nextReply recording-double pattern was NOT swept for the same default-reply vacuity. goods-checkout.test.ts uses an identical harness (its :90-94 nextReply is the same code) and was checked only for the mutations in this pass.
- Fixes that were author-verified and never independently re-examined: the entire 0026-0031 RLS incident response, and effectively all pre-2026-07 history. Absence of later findings there is absence of looking, not absence of defects.
- Hardcoded marketing '3%' copy outside the four sites (pricing page, homepage, deposit tool, guide, admin sponsorship panel) is tracked by the capability registry (pricingPageClaim 'needs update') and is founder-facing copy, deliberately out of Track D's mechanical scope.
- I did NOT sweep the codebase for em-dashes in user-visible strings; I verified only the two the plan named. A repo-wide sweep of JSX string literals and apps/web/content/legal was NOT done.
- I did not check whether any of the 68 tables' inline constraints have actually diverged in production — that needs a live pg_constraint comparison I did not run.
- I scanned only `create table if not exists` blocks. Sibling non-convergent shapes were NOT scanned: `create index if not exists` where the definition later changed, `create policy` without a preceding `drop policy if exists`, `create trigger` guarded by existence rather than dropped and recreated.
- Migrations 0108, 0109 and 0110 add further billing objects; I confirmed only that they contain no `references profiles(id)` lines. Whether they create tables with other cascade paths to profiles was NOT checked.
- Mobile /api/mobile/payments/requests/* refund responses.
- Mutating the shared compositor's totalAmount reddened exactly ONE test in the whole 2702-test suite (the C2 happy path). That suggests other consumers of computeAddonLines mock it. NOT inspected.
- My grep excluded *.md but covered the whole tree; only scripts/ matched, so apps/ appears clean, but I did not separately audit apps/mobile config files.
- No check was made for mangling in object COMMENTS, ACL grantee names, or the auth/storage schemas.
- No check was made of whether any existing test in apps/web/tests/db/ actually depends on the growth views' grants, so the concrete number of tests affected is unknown.
- No other name-keyed object class was swept for near-miss names (constraints, triggers, indexes matched exactly, but a name that differs only in invisible characters WOULD have shown as a missing/extra pair, and only this one did).
- No sweep was done for OTHER metadata keys that two features now share on one Stripe account. `artist_id` is on both the deposit intent and the P9 intent; `order_id` is on the combined deposit-plus-goods intent. Whether any consumer treats one of those as a discriminator was not checked.
- Non-public schemas were not swept for orphans.
- Orphan objects of other kinds in production were searched for only in the categories this diff covers (tables, views, sequences, functions, indexes, constraints, triggers, policies, enums, extensions, publications). Composite types, domains, operators, casts and collations were not enumerated.
- Other Sentry-capture-then-continue sites across the money path were not enumerated by me. Commit 3fce7be (2026-07-30) shows the class was still being found nine days later: 'the lost-claim read-back discarded its error ... the code CANCELLED AN INTENT A TWIN WAS COLLECTING ON'.
- Other audit_log event types that may also be written by only one of several equivalent action paths (refund marks, cancellation marks).
- Other bearer/secret comparisons outside the cron and admin-seed surface were not enumerated.
- Other bulk data operations performed via direct SQL without a logged trail (the migration-bookkeeping incidents in AGENTS.md are the same class).
- Other cached external-state denormalisations on profiles (Instagram token state from 0061/0062, subscription status from 0106) were NOT audited by me for the same 'cache asserts a capability the external system denies' shape.
- Other constants duplicating a schedule/registry value and agreeing only under current configuration were NOT swept for. Candidates I did not check: cap values in packages/shared/src/entitlements.ts vs docs/product/pricing-model.md, and the capability-registry-vs-CAPABILITIES lockstep that docs/architecture/capability-registry.md:3-6 says is required.
- Other migrations that self-document residual risks in comments but have no register entry.
- Other module-scope caches in route handlers were not enumerated.
- Other multi-statement read-then-write sequences in apps/web/src/lib/server/ were NOT enumerated by me. 'Read a count, then act on it in a separate round trip' is generic and I checked only collections and payment-requests.
- Other one-source-of-truth pairs between scripts/ and apps/web that encode the same policy twice (the entitlement caps in legacy-free-recompute.cjs:32-37 are explicitly described as mirroring packages/shared/src/entitlements.ts; I read the comment but did not diff the two).
- Other server actions that create-then-delete on failure: project intake, flash intake.
- Other tables where a function enforces business logic but RLS permits direct bypass: flash items, discount codes, any table with both a restrictive function and a permissive DELETE policy.
- Other webhook handlers that mutate money-adjacent counters were not enumerated by me for the delta-vs-converge property. The AGENTS.md rule is general but I verified it only for the sponsorship release path.
- PUT /api/mobile/goods/:id/variants and POST /api/mobile/goods/:id/image were not read; whether either can strand a partial write was not assessed.
- Prior multi-agent commits in this build have not been checked for swept-in files. The same race was possible throughout.
- Resend-side suppression/rate limiting was not inspected.
- Statement-level or deferred constraint triggers were not enumerated (I filtered on row-level DELETE/UPDATE tgtype bits).
- Stripe PaymentIntents left uncancelled by an abandoned standalone checkout were NOT inspected (they expire on Stripe's side; nothing reconciles them back).
- The (artist) action directories outside the audited subset — payouts, reminders, emails, deposits, dashboard, clients — appear in the count and were not read.
- The 2374-test unit suite (count from 3fce7be) has NOT been mutation-tested as a whole. Only the 14 golden fee tests and a handful of db tests carry demonstrated kill evidence.
- The ADD-ON checkout path (apps/web/src/app/request/[token]/actions.ts:478-531) performs the same two subtractions with the same v1-zero masking. Whether ITS tests exercise an accepted discount was NOT inspected.
- The DEPOSIT webhook's charge.refunded branch, which performs the same converge-to-a-target and then updates booking state. Whether its status write reaches the row it means to was not checked in this pass and no test imports that route.
- The Instagram sync/import paths in the shared sync module use the same token and were not inspected for the same catch-everything shape.
- The Playwright e2e suite was not examined by me for the same class.
- The RLS-write-policy-gap class (0120/0123, memory rls-write-policy-gap): same table-family, opposite direction (too little access vs too much) - not a ledger finding, noted for context.
- The Resend email webhook (apps/web/src/app/api/email/webhook/route.ts) was NOT inspected for the same shape: an event type it does not recognise returning a non-2xx.
- The Stripe Customer is never deleted either; I did not check whether an orphaned Customer with a saved payment method can be charged by any other path.
- The accepted residual — 'a refund that is itself later reversed does not re-debit, since the ledger only converges upward' (bcb45d5) — is recorded as known and handled by hand. No tooling for it was inspected.
- The account-deletion path uses the same ORDER_MONEY_STATES carve-out (account-deletion-logic.ts:44) and was not re-checked for the same discarded-error shape in this pass.
- The add-on order path (request/[token]/actions.ts:541-560) creates pending orders too; its rows DO carry booking_id, so the cleanup sweep can see the booking, but whether a pending add-on order is ever cancelled was NOT inspected here.
- The allocations read at ~line 135 in the same file, same discard shape, feeds collectedMinor.
- The appointment add-on / deposit checkout settlement + receipt path (file not identified in this task).
- The artist cancel path's forfeiture branch
- The billing-webhook endpoint's subscription set
- The bio-page shop teaser / public shop showcase's own custom-made rendering.
- The booking add-on refund branch of the same webhook was NOT inspected for the same consumed-flip-then-throw shape.
- The bookings cleanup cron's interaction with paid bookings (already noted in .claude-audit-digest-round1.md:153-156)
- The charge.refunded handler returns BEFORE settleGoodsOrderRefund when the PI has payment_allocations (webhook/route.ts:199-205). Today no appointment-payment PI writes an orders row (the only two order inserts are request/[token]/actions.ts:543 and goods-checkout.ts:209), so nothing is shadowed. If an appointment payment ever carries goods, that early return would skip the goods settle entirely. Recorded as a forward hazard; NOT a defect at this commit.
- The deposit endpoint's `account.updated` and `account.application.deauthorized` branches return 500 on a persistence error. Whether that can loop on a permanently failing account was not examined.
- The deposit path's `platform_fee_collected_cents` write, which 0128 cites as the precedent for this shape and which I did not read.
- The deposit path's refund gate (refundDepositCore) against booking statuses: whether a cancelled booking with a paid deposit has an equivalent stranded-money state was not checked in this pass.
- The deposit refund path (refundDepositCore) hardcodes refund_application_fee: true and is not wired into fee-refund-policy at all; whether artist-cancellation deposit refunds should retain a non-recoverable cost under v1 was not decided.
- The deposit webhook's own charge.refunded branch in apps/web/src/app/api/stripe/webhook/route.ts, which has no event-clock guard at all and is imported by no test.
- The existing deposit flow in booking_requests also has no aggregate ceiling across bookings for the same client — the same pattern at a different layer.
- The goods refund path and refundDepositCore: confirm no other route accepts a client-chosen fee/refund classification.
- The lifecycle email engine (runLifecycleEngine, 431 lines) has its own repeat-suppression logic which I did not read.
- The lifecycle engine's own send limits were not inspected and could interact with the same per-artist volume.
- The mobile app's copy was NOT swept.
- The mobile deposit route (apps/web/src/app/api/mobile/bookings/[id]/deposit/route.ts) was NOT inspected by me for the same degradation.
- The mobile order surfaces, if any read order_items by type, were NOT inspected.
- The mobile payouts onboarding route, if one exists
- The mobile routes OUTSIDE my assigned subset (bookings/*, flash/*, instagram/*, map/*, notifications/*, onboarding/*, account, analytics, billing/*, clients/*, calendar/*, devices, events, home, me, support, slots, waitlist) were included in the grep count but not read, so I know they carry the idiom and not whether they carry anything worse.
- The mobile shop surfaces, if any, were NOT inspected for this filter.
- The mobile twins of the audited mutations (/api/mobile/*) legitimately do not revalidate, since the app holds no Next.js cache. Whether the app refetches after each write was not inspected.
- The order_items currency hard-coding at actions.ts:486/557/574/586 versus a non-EUR artist
- The other Plus block families (feature blocks, featured_collection) at save: featured_collection is render-gated via the collection read; the six feature blocks are not appearance_custom-gated at render either, so their save-path status was not changed here and should be confirmed when those blocks are entitlement-gated.
- The project intake's uploaded storage objects have no orphan-cleanup job that I looked for. Whether one exists was not checked.
- The project portal token path, apps/web/src/app/project/[token]/page.tsx:89
- The refund path's payment_collections read, recorded separately as PAY-RFD-011.
- The remaining discarded-error reads in account-deletion.ts itself: the profiles select (~line 92) and the auth.admin.getUserById call (~line 101). Same shape, deliberately not widened into during a fee-scoped sweep, now assigned.
- The same collision shape could exist between any future append-only guard and any cascading FK. No lint or test exists to catch it.
- The same composite invariant on the deposit path: a booking whose deposit PaymentIntent succeeded after a payment_failed. apps/web/src/app/api/stripe/webhook/route.ts is imported by no test.
- The same question for SEQUENCES and for `revoke ... from public` on tables was not asked.
- The same reasoning applies to REFERENCES and TRIGGER privileges, which are also in the blanket grant and also not gated by RLS; neither was assessed.
- The studio-media and welcome-pack-files buckets (already flagged in the storage coverage row as having zero policies) have no equivalent scheduled purge that I found.
- The subject-scoped balance ceiling in the same quote uses `balanceExtrasFromLines(lines)` over the WHOLE frozen basket and was deliberately left alone: it answers a different question (what the appointment still owes) rather than what this charge takes. That reasoning was not independently reviewed.
- The two mobile Connect routes named above — NOT inspected.
- The ~20 unopened audit documents in docs/ would materially move this pattern's evidence base in either direction.
- The ~45 migrations whose headers make correctness claims I did not test (0067, 0070, 0075, 0080, 0082, 0088, 0106 carry particularly long explanatory headers).
- Triggers elsewhere in the migration set that read a parent row without FOR UPDATE/FOR SHARE were NOT scanned.
- Untracked local material (.scratch/**, .claude/**, .claude-audit-digest-round1.md, the .claude/worktrees checkout) contains many absolute paths; enumerated but out of scope because it is not in the repository.
- Webhook handlers were reported in the register as having the same unproven-Sentry question; not re-checked here.
- Whether `deposit_fee_sponsorship_booked_cents` is reset when a paid deposit is re-requested
- Whether `payment_intent.payment_failed` is actually subscribed (handler exists at route.ts:357; two of the four repo lists include it, ot-12-rollout-runbook.md does not)
- Whether an artist with a nonzero Connect balance at deletion time loses their payout route entirely was not traced; deletion removes the profile that the payout UI reads from.
- Whether anon can SELECT discount_codes: 0118's policies omit `TO authenticated` so they bind PUBLIC. Table-level GRANTs for anon were NOT checked against any catalog.
- Whether any OTHER Stripe-object-creating path lacks an entitlement gate (account-link creation, document upload from b5d33bf) — NOT inspected.
- Whether any OTHER money table stamps context read at settlement time rather than from the originating intent was not swept beyond the deposit lane.
- Whether any Supabase Edge Function or cron job runs as `authenticated` was not checked.
- Whether any already-written migration in 0000-0128 attempts a `drop policy if exists` against a name that production spells differently was not checked.
- Whether any invoice PDF or artifact lives in Supabase Storage under a prefix the purge would delete - artifacts.ts was not read.
- Whether any of the other nine scripts is a required step in a runbook a second person would execute — I confirmed runbook status only for verify-legal-artifacts.cjs.
- Whether any of the six tables retained rows written during the gap window was not checked.
- Whether any of these messages reaches an END CUSTOMER (rather than an artist) was not traced. The public and portal surfaces I did read do not, but I did not check the flash booking path.
- Whether any other Supabase-hosted function created before the 0060 pattern was established has the same gap. The EXECUTE grant sweep inspected all revoke/grant pairs and found none, but did not independently enumerate all function ACLs from production.
- Whether any other action name is exported from two different route directories was NOT swept for. I found this one by reading both files; I did not run a duplicate-export scan across the app directory.
- Whether any other grandfather grant (beyond the deposits override) crosses a v2 rate cell in a way the tier-only schedule does not capture.
- Whether any other signing key in the codebase falls back to a bearer secret was not enumerated (WA_VISITOR_HASH_SECRET was not checked).
- Whether db-backup.yml and coverage-worker.yml have equivalent silent-manual dependencies.
- Whether founder/team browsers are internal-marked at all (WA_EXCLUDE_IPS / inklee_internal), which decides how much of the 479-row web plane is external traffic.
- Whether packages/shared is covered by prettier — lint-staged also runs `prettier --write` on *.{ts,tsx} and prettier has no base-path restriction, so formatting may be covered where linting is not. NOT verified.
- Whether the Terms actually promise retention of these specific records — I did NOT read apps/web/content/legal/terms.
- Whether the audit register's own `pnpm audit:check` step, which IS in CI, would catch a stale generated report if findings.yaml were edited by a non-CI path.
- Whether the endpoint has 'events on connected accounts' enabled, which the Connect events at :147 and :162 require
- Whether the public artist page and the booking-request intake independently filter on anything equivalent was not traced.
- Whether vitest coverage includes packages/shared — commit 805358d notes the unit run 'globs src/** only', which suggests it may not. NOT verified.
- Which OTHER migrations were authored retroactively to describe already-applied production state is not established. Commit-message search for that pattern was not performed across all 127 migrations; only 0056 surfaced, and only because the diff pointed at it.
- `expired` and `cancelled`, which are also reachable while a claimed intent is still live and are likewise absent from the settle from-set; I did not construct those.
- `resolveOrderFee` (apps/web/src/lib/server/order-fee-sync.ts) prices a re-prepared deposit-plus-goods intent from `depositMinor` and a caller-composed `goodsBaseMinor`. Whether those can diverge from the amount that intent will actually take was NOT examined in this pass.
- apps/web/src/app/(artist)/bookings/settings/actions.ts contains saveAvailabilityAction, which writes the SAME books_settings keys minus books_open. Whether it should also audit was not assessed.
- apps/web/src/app/[slug]/flash/[flashSlug]/actions.ts imports BOTH honeypot and ratelimit, so it is presumed protected, but I read only the import list, not the call sites — it was not in my assigned scope and is NOT inspected.
- apps/web/src/app/api/cron/* handlers
- apps/web/src/app/api/email/webhook/route.ts
- apps/web/src/app/api/email/webhook/route.ts (167 lines, register says untested)
- apps/web/src/app/api/email/webhook/route.ts status codes
- apps/web/src/app/api/stripe/billing-webhook/route.ts status codes
- apps/web/src/app/api/stripe/billing-webhook/route.ts — same question about event.account and livemode
- apps/web/src/app/api/stripe/billing-webhook/route.ts — whether subscription invoice PIs could ever carry booking_id
- apps/web/src/app/download/actions.ts is in the ratelimit list but NOT in the honeypot list. Whether that is deliberate (it is a plain waitlist signup) or the same omission was not established.
- apps/web/src/app/request/[token]/actions.ts:119 — another `customer_token_hash` rotation, error handling not inspected
- apps/web/src/lib/analytics-gates.ts and growth-queries.ts also branch on ADMIN_EMAILS and were not compared.
- apps/web/src/lib/order-fulfillment.ts
- apps/web/src/lib/order-fulfillment.ts decrementInventory internals
- apps/web/src/lib/server/bookings.ts refundDepositCore and cancelBookingCore interaction with a partial refund
- apps/web/src/lib/server/discounts.ts recordDiscountRedemption
- apps/web/src/lib/server/storage-purge.ts was NOT inspected for the same retention conflict.
- apps/web/tests/db/appointment-payments-rls.test.ts: inspected 2026-07-29 for N1/N2 shapes and found clean (no bare not.toBeNull, no undestructured setup writes). Moved to inspected_comparables_without_issue.
- billing_subscriptions.last_event_created (0107) and its caller in apps/web/src/app/api/stripe/billing-webhook/route.ts: the same guard shape, never probed for the equal-timestamp case.
- charge.dispute.* for appointment payments, which A4 deliberately defers to A5 and which has to move BOTH the allocations' status and the request's. It will meet exactly this seam.
- cleanup's overdueWindow (route.ts:92-94) also builds a date key from a UTC instant and compares it to a DATE column (deposit_due_at is DATE per 0006_deposit_fields.sql:3); I read it and found the comparison type-consistent but did not analyse its timezone edges.
- docs/ contains roughly twenty one-off audit documents (security-audit-2026-06-10.md, payment-audit-2026-06-03.md and -06-05.md, mobile-audit-2026-06-08.md, mobile-audit-2-2026-06-08.md, launch-readiness-audit.md, web-functionality-audit-2026-06-11.md, analytics-audit-2026-05-14.md, flash-parity-audit-2026-07-04.md, mobile-web-audit-2026-06-18.md, admin-growth-cockpit-audit.md, me15-tablet-audit.md, branding-ui-audit.md, nav-auth-ui-audit-slice-61.md, seo-geo-audit-slice-1.md, phase-d-audit-2026-05-24.md, docs/ux-audit/) that I did NOT open. Each is a candidate carrier of the same defect: a verdict recorded without executed evidence, now cited as authority.
- every remaining /api/mobile/* route
- executeCoverageTask, handOffBatches, finalizeRun (all in seed-coverage.ts) - the 1847-line module was only read around the claim path.
- gsc-sync's rolling 10-day window self-corrects late data and so is gap-tolerant by design; the coverage-worker's checkpointing was not evaluated for gap recovery.
- idx_map_locations_name_trgm (the sibling index in 0097) matched exactly; no other 0097 object was individually read.
- markConnectAccountUnreachable's interaction with this state
- moderation_statements is deliberately excluded from the purge (:129-132) pending Phase 7; nothing enforces that its 5-year bound is eventually implemented.
- order_fulfillment_status also declares a 'cancelled' label (0036:12-14) and COMPARED CLEAN, but no other enum in the repo was checked for semantically-equivalent silent-mismatch classes (e.g. trailing whitespace, case).
- packages/shared/src/order-fees.ts and fee-schedule.ts were not read in full by me; my evidence for the engine's current shape is order-fee-sync.ts plus commit messages.
- pg_default_acl differences between local and production were not diffed, so whether newly created production objects will keep inheriting this grant is assumed, not verified.
- product_collections.is_public_visible (0120:19). Whether any standalone-shop surface will read collections was NOT inspected.
- profiles.deleted_at / deleted_by have no writer that I found in the deletion path; who sets them, if anyone, is unknown.
- reconcileVariants (lib/server/goods-variants.ts) performs N unbatched writes with no transaction and no rollback, so a mid-loop failure leaves a partially reconciled variant set. I read the function but did not assess that property; it is recorded here as uninspected rather than as a finding.
- refundDepositCore and the goods refund path: confirm their idempotency keys are deterministic (goods refund path does not yet exist).
- reorderCollectionsCore and reorderCollectionProductsCore in lib/server/collections.ts have the same unbatched-loop shape and return on first error, leaving a partial ordering. The file's own comment accepts position ties as cosmetic, but the partial-reorder case is not discussed and was not assessed.
- scripts/billing/stripe-test-lib.cjs has the same env-first order for STRIPE_SECRET_KEY; it refuses a live key, but I did not audit that refusal.
- scripts/country-geo-import.cjs, seed-country.cjs and seed-coverage.cjs read CRON_SECRET env-first and were not evaluated for the same retargeting shape.
- settlePaymentRequestRefund (the appointment-payment lane) also refunds with fee handling and was NOT inspected in this pass.
- startPlusConsumerCheckoutAction and confirmBusinessCheckoutAction also do not revalidate, but both hand back a Stripe URL and the return trip lands on /settings/plan?checkout= success, so their staleness question is different and was not assessed.
- storage-purge.ts still unread for the same retention conflict (carried over from BILL-ENT-002).
- syncDate and the gsc_* upserts; the backfill cursor advance (sync.ts:276-313) writes cursor_date after a batch with no lock re-check.
- withdrawal.ts was only grepped, so whether an in-flight withdrawal case interacts with deletion is unassessed.

## Recommended independent-auditor priorities

1. **PAT-001** (systemic): A safety property is asserted in a comment or commit message before it has ever been executed, and the assertion then suppresses the next reader's inspection
2. **PAT-002** (systemic): Independent adversarial verification is the only mechanism in this repo that has ever caught a defect in a fix, and on the money path it has caught one every ti
3. **PAT-003** (systemic): A PostgREST error is discarded, so a transient failure is indistinguishable from a legitimate empty result
4. **PAT-004** (systemic): A database read whose error is never bound, degrading silently to a plausible empty value that the caller then acts on
5. **AUTH-RPC-001** (critical, unverified): book_flash_item and increment_fee_sponsored_used were callable by anon via PostgREST until 0060 revoked the grants
6. **PAY-DEP-001** (critical, unverified): A Stripe failure silently converted a card deposit into a manual one, producing a booking with no pay button; the first fix re-opened the same silent degradation
7. **ABUSE-PUB-001** (high, unverified): The public project intake server action has none of the five abuse controls its direct sibling, the public booking intake, applies — no honeypot, no origin check, no rate limit, no image MIME allowlist and no dedupe
8. **AUTH-MFA-001** (high, unverified): The MFA step-up gate fails OPEN on a transient failure, in production, and the page it redirects to fails open in the same direction
9. **AUTH-RLS-003** (high, unverified): product_collections RLS DELETE policy allows artists to bypass delete_collection_if_eligible safety check, cascade-deleting populated collection items
10. **BDEL-PAY-001** (high, unverified): Account deletion does not archive or pseudonymize P9 appointment payment data before the cascade destroys it
11. **BDEL-PAY-002** (high, unverified): Account deletion's deposit read discarded its error, so a transient read failure let deletion proceed as though the artist had no deposits at all
12. **BDEL-RET-001** (high, unverified): Terms and Privacy promise post-deletion retention of billing and tax records that the cascade destroys, and the retained archive has no field for any of them
13. **BDEL-SUB-001** (high, unverified): Confirms and extends BILL-ENT-002: deletion never touches the subscription, and the cascade is now empirically shown to destroy billing_subscriptions and billing_consent_records
14. **BDEL-TTS-001** (high, unverified): An append-only trigger on transaction_tax_snapshots aborts the profiles cascade, so account deletion fails permanently after irreversibly cancelling the client's deposit PaymentIntents
15. **BILL-ENT-002** (high, unverified): OPEN: account deletion cancels PaymentIntents but never the subscription, and all nine billing/tax tables cascade-delete with the profile
16. **CRON-CLN-001** (high, unverified): cleanup discards the error from the 7-year financial-retention lookup, so a transient failure deletes bookings carrying financial records
17. **CRON-RMD-001** (high, unverified): Deposit-overdue reminder re-sends to the same customer every day forever; one production recipient has received 46
18. **DATA-MIG-001** (high, unverified): `migration repair --status applied` on 2026-04-20 marked 0001_rls_policies.sql applied without running it, leaving 6 core tables with RLS disabled in production for ~3 weeks
19. **DRIFT-ENUM-001** (high, unverified): Production's order_status enum holds a mangled label `cancel\r\n  led` instead of `cancelled`, so 'cancelled'::order_status is not a valid value in production
20. **GAL-REL-001** (high, unverified): The C1.5 gallery relocation control silently and PERMANENTLY self-disables on a transient read failure, leaving client photographs public
21. **GOODS-SET-001** (high, unverified): A discarded read in a read-modify-write DESTROYS the artist's entire settings blob, and being a write it does not self-heal
22. **PAY-AUTHZ-001** (high, unverified): refundDepositCore refunded whatever PaymentIntent the booking row named, without ever checking the intent belonged to the caller - and the pattern is LIVE ON PRODUCTION
23. **PAY-AUTHZ-002** (high, unverified): refundGoodsOrderCore had the same defect, and the attacker authors the order_items the refund amount is computed from
24. **PAY-BAL-001** (high, unverified): deposit and balance payment requests have no subject-scoped ceiling because the stored final service price is null in production
25. **PAY-CONN-001** (high, unverified): Cached Connect state asserted a routing capability Stripe denied, and the first corrective predicate was broad enough to downgrade the entire artist fleet on one platform-scope fault
26. **PAY-FEE-002** (high, unverified): The appointment platform fee was computed on the whole frozen basket while the charge was the remainder, so a partial collection was charged the fee twice and could exceed the amount
27. **PAY-ORD-001** (high, unverified): The refund ordering guard compares a second-granularity clock with a strict `<`, so a stale `charge.refunded` created in the same second as the newest one is applied and walks the recorded refund backwards
28. **PAY-ORD-002** (high, unverified): A `payment_intent.succeeded` cannot move a request out of `failed`, so a collection recorded after a payment_failed on the same intent leaves the request permanently `failed` with the money already allocated, and says nothing
29. **PAY-RFD-001** (high, unverified): A fully refunded appointment payment request still reads `paid`: the refund converges the money and never moves the request's status
30. **PAY-RFD-002** (high, unverified): Fee refund policy v1 'retain non-recoverable' retains the whole platform fee, not the actual Stripe cost
31. **PAY-RFD-011** (high, unverified): The refund path cannot tell a failed payment_collections read from an absent row, and the fallback can retain processor cost from the buyer twice
32. **PAY-RLS-005** (high, unverified): 0128 anon SELECT policies expose every sent payment request via the anon key
33. **PAY-SPON-001** (high, unverified): Sponsorship waivers were released against PaymentIntent metadata (intent) rather than what settlement actually booked, erasing other bookings' real cap usage; and the first webhook release added a delta instead of converging to a target
34. **PAY-WHK-001** (high, unverified): A P9 appointment-payment intent reaching the deposit webhook answers 409, which is a failed delivery that would push Stripe toward disabling the endpoint every real deposit settles on
35. **WEB-XSS-001** (high, unverified): Stored XSS on the public /studios/[slug] page: JSON-LD emitted with raw JSON.stringify into dangerouslySetInnerHTML, bypassing the repo's own escaper
36. **WHK-COLL-001** (high, unverified): P9 appointment-payment intents stamp metadata.booking_id into the same payment_intent.succeeded stream the deposit webhook claims, and the deposit webhook has no discriminator
37. **WHK-ERR-001** (high, unverified): 17 of 23 Supabase calls in the deposit webhook discard the error, and the handler then returns HTTP 200, so Stripe never redelivers and the skipped money work is permanently lost
38. **WHK-TOK-001** (high, unverified): The customer's magic-link token is rotated inside the atomic settlement flip, then delivered by an email path that swallows every error and can never be retried
39. **Uninspected**: Mobile client (Expo app) / mobile
40. **Uninspected**: Background jobs and crons / jobs
41. **Uninspected**: Dependency security / secops
42. **Uninspected**: Production configuration / platform
43. **Uninspected**: Payments / Stripe webhook endpoint event subscription (Dashboard-side configuration)

## Limitations and confidence warnings

- Findings marked `hypothesis` or `low` confidence are **not established**. Root-cause hypotheses may be wrong.
- `currently-unreachable` reflects the system as inspected at the stated commit. Reachability changes with configuration, entitlement grants and deployment state.
- Coverage `none` means **not inspected**. It is never a safety claim.
- The database test suite runs against a LOCAL stack. Production schema drift is not covered by it.
- This repository is **public**. Some evidence is deliberately abbreviated; see each finding's `disclosure` block.
