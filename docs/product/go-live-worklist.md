# Go-live worklist

**Written 2026-08-02, updated the same day the counsel-answer waves landed.
Next milestone: GO LIVE.** One ordered list, worked off
top to bottom. Every item names its evidence id so you can `grep` it in
`docs/audit/findings.yaml` for the full reasoning, or its source doc.

**Where things stand.** The product is BUILT: all thirteen FD rulings are
implemented, the Plus/goods/payments build is complete and dark, local `master`
is ~145 commits ahead of `origin/master` and migrations 0125-0145 are not in
production. Web suite 3261 green, database suite 299 green, register 141
findings / 92 coverage areas, `pnpm audit:check` clean.

**What moved since this list was written.** The counsel and accountant answers
came back inside the handoff and have been worked off in three waves: C1.1-C1.6,
C1.8, C1.9, C1.10, A2, A6, A7, and the Gate 0 cron cluster. Eleven commits, five
new migrations (0141-0145). The Gate 0 items struck through below were fixed in
those waves. Everything fixed is `fixed-unverified`, which lands in Gate 2, and
Gate 2 is the gate that grows as the others shrink: **114 of 141 findings have
never been checked by anyone who did not write the fix.**

**Three defects from the last wave deserve attention on their own**, because
none of them was on any list and all three were surfaced by workers reporting
outside their assigned scope rather than by review. The artist fee-savings goods
lane has been reporting zero since it shipped, on both web and the app: it
selected a column that does not exist and discarded the error. The drop gate was
missing from the payable add-on path while present on the display path in the
same file. And the add-on receipt showed the combined deposit+goods total as the
goods total. The first is live today; the other two sit behind the goods flag.

**The honest headline for planning.** The remaining work is NOT mostly the new
build. It is **41 open high/medium findings, the majority of them in code that
is already live**, from an earlier reconnaissance that was never worked off:
15 cron, 10 webhook, 8 account-deletion, plus drift and ops. Those clusters are
the real distance to go-live, and several are user-visible today (a reminder
that re-sends to the same customer every day, an account deletion that aborts,
a deposit webhook that discards 17 of 23 database errors).

Gates are ordered by dependency. Inside a gate, order is by severity.

---

## GATE 0 — Live defects in production (do these first, independent of launch)

These are wrong *right now*, on `origin/master`, for real users. None needs the
new build.

- [x] ~~**CRON-RMD-001** (high) Deposit-overdue reminder re-sends forever.~~
      FIXED `9a7c3536`: an all-time cap of 5 counted from `reminder_sent` audit
      rows, plus a 30-day staleness floor. Two independent guards, each
      mutation-proven. **The production tail is not fixed and cannot be from
      here**: 275 sends across 10 bookings already happened.
- [ ] **WHK-ERR-001** (high) 17 of 23 Supabase calls in the deposit webhook
      discard their error, and the handler then reports success. Every one of
      those is a silent money-adjacent write failure. Fix as a batch.
- [x] ~~**CRON-CLN-001** (high) Cleanup discards the retention-lookup error.~~
      FIXED `9a7c3536` by failing closed: on a guard error the delete step is
      skipped entirely for that run. The mutation did not merely go red, it
      reproduced the incident (both fixture bookings hard-deleted).
- [x] ~~**BDEL-TTS-001** (high) Append-only trigger aborts the profiles
      cascade.~~ CONFIRMED FIXED BY EXECUTION rather than by reading: a db test
      deletes a fixture profile and asserts the delete succeeds.
- [~] **BDEL-SUB-001 / BILL-ENT-002** Cancellation is fixed; the TAIL IS OPEN
      and in flight: the reconciler trusts Stripe metadata naming a deleted
      profile, so a late webhook writes a dangling `artist_id` and raises 23503
      inside a webhook handler. Severity dropped high to medium on recheck.
- [x] ~~**BDEL-RET-001** (high) Deletion destroys records the Terms promise to
      retain.~~ FIXED `7071ac08` across all eleven tables. **Its repair created
      the inverse gap** (BDEL-RET-002): five tables then survived forever with no
      purge deadline. Four are fixed in `eb1b8aed`. The fifth,
      `transaction_tax_snapshots`, cannot be purged at all (append-only by
      deliberate design) and is now counsel question Q1, because it makes the
      subscriptions those snapshots reference effectively permanent too.
- [ ] **DRIFT-ENUM-001** (high) Production's `order_status` enum holds a mangled
      label (`cancel\r\n  led`). Repair with a catalog-verified migration.
- [ ] **ABUSE-PUB-001** (high) The public project-intake action has none of the
      five abuse controls its sibling public form has (honeypot, origin check,
      rate limit, MIME allowlist).
- [ ] **AUTH-RLS-003** (high) `product_collections` DELETE policy lets an artist
      bypass the eligibility RPC.
- [ ] **CRON-SEC-001** (medium, but read it early) One `CRON_SECRET` authorises
      eleven endpoints including bulk deletion and customer email.
- [~] **CRON-OBS-001** (medium) PARTIAL `9a7c3536`: Sentry capture on every
      failure path of the three routes touched. The other eight cron endpoints
      still report nothing, so this stays open. Worth stating plainly: the total
      absence of cron observability is why CRON-RMD-001 reached a documented run
      of 46 sends to one address before anyone noticed.
- [ ] Remaining **CRON-\*** cluster (12 more) and **WHK-\*** cluster (9 more) —
      triage as one sweep each; they share root causes (discarded errors,
      unbounded loops, no observability).

## GATE 1 — Structural half of the 2026-08-02 audit (must precede the push)

Two items were added here by the last wave, both structural rather than
instance-level. `addon-products.ts` maintains two hand-written column lists for
one catalogue, which is the drift that produced SHOP-DROP-002. And no sweep has
looked for other readers that sum `booking_requests` fees alongside `orders`
fees the way the broken fee-savings query did. Both are in flight.

Deliberately not shipped blind, because these are migrations that can fail or
lock on real production data. Each needs a duplicate/consistency check first.

- [ ] **PAY-AUTHZ-001 tail** UNIQUE partial index on
      `booking_requests.deposit_payment_intent_id`; REVOKE artist write access
      to the deposit columns (the 0074 profiles pattern). Check for existing
      duplicates in production BEFORE creating the index.
- [ ] **PAY-AUTHZ-002 tail** Replace the `FOR ALL` policies on `orders` and
      `order_items` with SELECT-only `TO authenticated` + REVOKEs (both are
      service-role-write by design, as 0139 already does for `refunds`); UNIQUE
      index on `orders.stripe_payment_intent_id`.
- [ ] **PAY-AUTHZ-002 (b)** Decide whether `(artist)/goods/sales` should be
      parked behind `GOODS_COMMERCE_ENABLED` like the rest of the goods build.
      It is the one money-moving route without the flag.
- [ ] **PAY-AUTHZ-003 tail** Db test asserting `payment_requests_intent_idx` is
      UNIQUE (it is load-bearing security and undocumented as such); add
      `payment_intent_id` to the frozen-column set for a sent request; correct
      0127's stale guard comment.
- [ ] **SHOP-MIG-002** Re-argue the risk acceptance. Its premise ("no client
      write path to `order_items`") was disproved by execution.
- [ ] **HUB-GAL-008 + HUB-GAL-002** Together: a real dual-stack SSRF allowance
      needs the v4 set validated AND the connection pinned via a custom undici
      dispatcher. Same work closes the rebinding TOCTOU. **Blocks granting
      `rich_content_blocks`** — until then Import-from-URL refuses ~70% of real
      image hosts.
- [ ] **SEED-GRT-001** `seed.sql` re-grants ALL after migrations, clobbering
      table REVOKEs on 4 tables today and 3 more at the next local reset.

## GATE 2 — Verification debt (nothing here is verified by an independent pass)

**This gate grew while the others shrank, which is the honest picture: 114 of
141 findings are not independently verified.** Every counsel-wave fix was tested
by the worker that wrote it, and the three most recent were written AND tested by
the supervisor session itself, with `independent: false` recorded on each. That
is not a reason to distrust them; it is a statement that the second pair of eyes
has not happened. The
highest-value subset:

- [ ] **Refund arithmetic across 3+ successive partial refunds** — round 5 said
      explicitly it did not test this and must not be cited as having done so.
      Per-line-ledger vs order-balance consistency under interleaving.
- [ ] **The seven audit fixes** (`PAY-AUTHZ-001/002/003`, `WEB-XSS-001`,
      `PAY-WHK-002`, `MAP-SSRF-001`, `HUB-GAL-008`) — fixed by the same session
      that found them.
- [ ] Cart-clear on webhook redelivery and on failed payment; cart repricing
      when the catalog moves underneath it; guest cookie handling (**FD5**).
- [ ] FD6's one-rule `resolveBundleComponent` claim and the variant pass-through
      to both inventory movers; **GOODS-VAR-001**.
- [ ] The native revise screen (**FD12**), never exercised.
- [ ] **The counsel-wave fixes** (C1.1-C1.6, C1.8-C1.10, A2, A6, A7, the cron
      batch, FEE-DSP-002, SHOP-DROP-002). Route each to a different instance
      than the one that wrote it.
- [ ] **Run the database suite in CI**, plus the canary-proven RLS
      column-shadowing sweep as a CI step. The db suite was dark for the whole
      build and hid a real defect for a day; the policy sweep catches a class
      that is invisible to review.

## GATE 3 — Human sign-offs (start the clock early; they gate the flip)

Full text in `docs/product/plus-consolidated-review-handoff.md`.

- [ ] **AC1** Accountant price-display co-sign — head of the whole chain,
      irreversible Stripe Price semantics.
- [ ] **AC2/AC3** Thresholds + monitoring; fee schedule v2 sign-off.
- [ ] **AC9/AC10** Partial-refund allocation; variant-bundle reconciliation.
- [ ] **AC4/AC5** Standalone goods flow classification; goods invoicing.
- [ ] **CL2-CL6 (GS1-GS4, GB3)** The goods shop as a consumer surface counsel
      has never seen: distance-selling duties, return right, durable order
      confirmation, guest-buyer GDPR, hosted client photos.
- [ ] **CL10/CL11/CL12** External image import; guest carts as a personal-data
      store; partial-refund disclosures.
- [ ] **CL7** Terms coverage of the retained-processor-cost rule.
- [x] **LO-5 DPIA** — OWNER: Michel Kraeft (founder, controller), confirmed 2026-08-02.
      **COMPLETE AND SIGNED 2026-08-03** at `docs/legal/lo-5-dpia.md`: sections 1-5 from
      evidenced facts, sections 6-8 adopted and signed by the controller. Outcome: residual
      risk not high, no Art. 36 prior consultation. Three mitigations (R3, R4, R6) are wired
      as named gate keys in `dpia-gate-preconditions.ts` and stay unbuilt-blocking until the
      founder records each key. This row previously read "TARGET DATE: NOT SET" after the
      document had already moved; round-5 §0 reported that staleness to counsel, and this
      update is its correction (2026-08-03).
- [ ] **CL8** LO-10 round.
- [ ] **CL1** The single consolidated approval, recorded against versioned
      artifacts. Everything above feeds it.

## GATE 4 — Release the build (migration-first; nothing below is deployable before it)

- [ ] **FA1** Apply migrations **0125-0145** to production, catalog-verified,
      via the release-sequencer flow. **0140 must follow 0138.** 0144 and 0145
      were authored by two workers in parallel and have never been applied
      together in a single isolated pass; do that before the production run. Then push
      `master`. Never a casual push: the deployed code expects every one of
      these tables.
- [ ] **FA6** Run `migrate-deposits-key.cjs` against production.
- [ ] **FA3** Fresh EAS build — the current one predates the gallery editor,
      revise screen, bundle variant pickers, collections and image gallery. It
      gates every mobile-dependent capability grant.
- [ ] **FA4** Verify the dispute-events subscription on the LIVE Stripe webhook
      (**WHK-DSP-001**: the handler exists, nothing subscribes it).

## GATE 5 — Activation ladder (in this order, each one-way)

- [ ] **FA2** G-5 live-money test: real Connect onboarding, a real charge, a
      real refund. **No live charge has ever been observed end to end.** Nothing
      external happens before this.
- [ ] **FA5** Un-park `custom_templates` / `analytics` / `entitlement_caps`;
      re-run the legacy grandfathering recompute IMMEDIATELY before cap
      enforcement.
- [ ] **FA7** Insert the `founder_offer_policy` row.
- [ ] **FA7b — the as-deployed condition (counsel §5.5(1), restated round-3
      §6.6 and round-4 §6, encoded here per round-5 §4.6).** Before ANY
      approval key below is recorded: the release candidate is pushed, the
      migrations are applied, and the C2 price-adjacent-to-button screenshot
      is taken from the DEPLOYED surface. Approval is recorded against
      artifacts as deployed, never against a local build. FA8, FA10 and the
      CL1 recording all inherit this precondition.
- [ ] **FA8** Re-record the four engineering approval keys against the final
      release candidate.
- [ ] **FA9** Stage-6 Terms edit through the versioned snapshot workflow
      (includes X2's line-76 wording and whatever counsel returns), then counsel
      re-confirm. Editing the live file alone fails CI by design.
- [ ] **FA10** Record `consumer_sales_launch_approved`. The final gate.
- [ ] **FA11** Flip `ACTIVE_FEE_SCHEDULE_VERSION` to v2 — only after AC3 and the
      Terms notice.
- [ ] **FA12** Un-park `GOODS_COMMERCE_ENABLED` — only after GS1-GS4 + GA1-GA2
      are answered, FA2 has passed, and Gate 1's structural items are in.
- [x] **Q16-R1** Notice-and-action for gallery images (counsel round-2 Q16,
      DPIA mitigation R1; task #79). **COMPLETE 2026-08-04**: all four elements
      built + pushed, migration 0155 applied+verified in prod, both independent
      passes done, DSA-QUE-001 fixed+verified, gate key
      `dpia_r1_notice_and_action_built` RECORDED in prod. (1) the "image of me
      without consent" report category
      (shared `report-categories.ts`) + a "Report content" link on the public
      Hub; (2) the durable `content_reports` queue (migration 0155) and the
      `gallery-takedown.ts` removal action that deletes the storage object from
      both private gallery buckets, with a real-storage db test; (3) the DSA
      procedure §2b (v3); (4) the Art. 16(5) acknowledgement, which fires for
      the new category with no branch. Discharges the second condition of the
      C1.6 hosting grant. The `/admin/content-reports` LIST page shipped
      (`2131d3fe`), both independent-verify passes are done, DSA-QUE-001 (the
      best-effort queue write) was fixed load-bearing (`b9f89a23`) and
      independently verified, and gate key `dpia_r1_notice_and_action_built` is
      RECORDED in prod (2026-08-04, approved_by "Management board (M. Kraeft)").
      It guards the gallery gate beside R3/R4/R6, which remain UNRECORDED, so the
      gallery gate stays closed. Non-blocking follow-up: an ops runbook for the
      rare content_reports insert-and-retry-both-fail case.
- [ ] **B2 / Q20-DSA-§4** The DSA Section 4 trader-traceability threshold
      (counsel round-2 Q20 second half). Add a `dsa_micro_small_2003_361` row to
      `tax_thresholds` (alongside the VAT thresholds so one quarterly check
      covers both) that alerts if Inklee crosses the small-enterprise ceiling
      under Rec. 2003/361. **Blocked on counsel round-6 Q1 (the ceiling figure)
      and Q2 (the Section 3/Art. 19 vs Section 4/Art. 29 citation);** the row is
      deliberately not seeded with an invented figure. The DSA-procedure §6 note
      and this line both point at that pending answer.
- [ ] Grant the capabilities: `rich_content_blocks` (needs HUB-GAL-008 and
      Q16-R1), `goods_collections`, `goods_bundles` (both need FA3).

## Not blocking go-live, but do not lose

- [ ] **PAY-RFD-008** Needs a Stripe test-mode reproduction before any code
      change (never build on a guess about processor behaviour).
- [ ] **HUB-GAL-007** Abandoned-upload orphans: a sweep at un-park.
- [ ] **DATA-ORPH-001**, **OBS-MAP-001**, **OPS-DOC-001**, the `DRIFT-*`
      remainder, and the low-severity audit tail reported but never verified
      (in the workflow output, not the register).
- [ ] Native screens for the two mobile settings routes FD5/FD2 added but never
      surfaced in the app.

---

### How to work this

Gate 0 is independent of everything and fixes real user-facing harm, so it can
start immediately and in parallel with the sign-offs in Gate 3 (which are
waiting on other people, so start them early). Gate 1 must land before Gate 4's
push. Gate 2 can run alongside Gates 0-1. Gate 5 is strictly sequential and each
step is one-way.

Two rules that have already saved this build and should hold to the end: **a
migration that re-runs without erroring has not necessarily converged** —
verify the specific object; and **a written claim that has never been executed
is not evidence** — the audit found three of those, one of them written by the
supervisor.
