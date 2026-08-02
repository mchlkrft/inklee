# Go-live worklist

**Written 2026-08-02. Next milestone: GO LIVE.** One ordered list, worked off
top to bottom. Every item names its evidence id so you can `grep` it in
`docs/audit/findings.yaml` for the full reasoning, or its source doc.

**Where things stand.** The product is BUILT: all thirteen FD rulings are
implemented, the Plus/goods/payments build is complete and dark, local `master`
is ~130 commits ahead of `origin/master` and migrations 0125-0141 are not in
production. Web suite 3103 green, database suite 255 green, register 136
findings / 87 coverage areas, `pnpm audit:check` clean.

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

- [ ] **CRON-RMD-001** (high) Deposit-overdue reminder re-sends to the same
      customer every day, forever. One production customer has already received
      a documented run of them. Fix the once-per-booking guard.
- [ ] **WHK-ERR-001** (high) 17 of 23 Supabase calls in the deposit webhook
      discard their error, and the handler then reports success. Every one of
      those is a silent money-adjacent write failure. Fix as a batch.
- [ ] **CRON-CLN-001** (high) Cleanup discards the error from the 7-year
      financial-retention lookup, so a transient failure deletes bookings it was
      supposed to retain. Data loss, irreversible.
- [ ] **BDEL-TTS-001** (high) An append-only trigger on
      `transaction_tax_snapshots` aborts the profiles cascade: account deletion
      can fail outright. A GDPR obligation that does not complete.
- [ ] **BDEL-SUB-001 / BILL-ENT-002** (high) Account deletion never cancels the
      Stripe subscription. A deleted account keeps being billed.
- [ ] **BDEL-RET-001** (high) Terms and Privacy promise post-deletion retention
      of billing and tax records that deletion actually destroys. The document
      and the code disagree; counsel needs the outcome either way.
- [ ] **DRIFT-ENUM-001** (high) Production's `order_status` enum holds a mangled
      label (`cancel\r\n  led`). Repair with a catalog-verified migration.
- [ ] **ABUSE-PUB-001** (high) The public project-intake action has none of the
      five abuse controls its sibling public form has (honeypot, origin check,
      rate limit, MIME allowlist).
- [ ] **AUTH-RLS-003** (high) `product_collections` DELETE policy lets an artist
      bypass the eligibility RPC.
- [ ] **CRON-SEC-001** (medium, but read it early) One `CRON_SECRET` authorises
      eleven endpoints including bulk deletion and customer email.
- [ ] **CRON-OBS-001** (medium) No cron reports to Sentry. A missed or failed run
      is invisible; two consecutive misses are how CRON-RMD-001 stayed unnoticed.
- [ ] Remaining **CRON-\*** cluster (12 more) and **WHK-\*** cluster (9 more) —
      triage as one sweep each; they share root causes (discarded errors,
      unbounded loops, no observability).

## GATE 1 — Structural half of the 2026-08-02 audit (must precede the push)

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

45 findings sit at `fixed-unverified`, including all seven from the audit. The
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
- [ ] **CL8** LO-10 round.
- [ ] **CL1** The single consolidated approval, recorded against versioned
      artifacts. Everything above feeds it.

## GATE 4 — Release the build (migration-first; nothing below is deployable before it)

- [ ] **FA1** Apply migrations **0125-0141** to production, catalog-verified,
      via the release-sequencer flow. **0140 must follow 0138.** Then push
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
- [ ] Grant the capabilities: `rich_content_blocks` (needs HUB-GAL-008),
      `goods_collections`, `goods_bundles` (both need FA3).

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
