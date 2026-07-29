# Plus: the remaining work, ordered

**Written 2026-07-29** after the post-merge launch-readiness audit (5 lenses,
adversarial verification, 2 of 10 blocking claims confirmed and 8 refuted or
downgraded).

**This is a SEQUENCING document, not a second source of truth.** Content lives
where it already lives: `plus-payments-architecture.md` (what P5b is),
`plus-product-spec.md` (what Plus is), `plus-build-plan.md` (stage table),
`plus-commercial-packages.md` (commercial), `pricing-model.md` (pricing). Where
this document and one of those disagree about WHAT something is, they win. This
one only says in what ORDER and why.

---

## The founder decision that selected this plan

Two tracks were put up on 2026-07-29:

- **Track A, full package**, 10-15 working weeks, dominated by P5b.
- **Track B, re-cut** the marketed list to the seven capabilities that already
  enforce, 4-6 weeks.

**Track A was chosen**, by directing appointment payments as the next milestone.
Track B is recorded here rather than deleted, because it stays available if the
date ever matters more than the scope, and because the reasoning behind it is
the useful part.

---

## The finding this plan exists to fix

> The working differentiation is entirely unsold, and the sold differentiation
> is largely non-working.

Verified in production on 2026-07-29:

- **2 of 5 marketed benefits genuinely differentiate.** Card deposits and
  branding. The other three (custom email templates, higher limits, advanced
  analytics) are free for every account.
- **7 capabilities enforce correctly and NONE of them is marketed**:
  `large_projects`, `appearance_custom`, `form_custom`, `form_conditional`,
  `goods_discounts`, `goods_scheduling`, `goods_collections`.
- The **live Terms section 11** names four benefit families, three of which are
  currently free. That is a shipped contractual document, live today,
  independent of any launch flag.

Nothing can be charged today: both `consumer_sales_launch_approved` and
`business_sales_launch_approved` are absent from `billing_activation_approvals`,
verified live. The hold is working. That is what makes the above a scheduling
problem rather than an incident.

---

## Stage 0: correctness fixes (parallel to everything, ~1-1.5 weeks)

None of these depend on P5b, and none should wait for it. Ordered by what a
paying customer would hit first.

| id | item | why now | size |
|---|---|---|---|
| C1 | **Account deletion never cancels the subscription**, and all eight billing/tax tables are `ON DELETE CASCADE` on `profiles`, so the records Terms promises to retain are destroyed. Downstream, later `invoice.paid` events carry a deleted `artist_id`, reconcile hits 23503, the handler 500s, and Stripe eventually disables the endpoint for everyone. | Charging someone after they delete their account is a consumer-law and chargeback problem, not a bug. Latent only because zero subscriptions exist. | M+L |
| C2 | **Yearly Plus is advertised and unselectable.** `upgrade-button.tsx:47-48` renders the yearly option only when `yearlyFirstYearLabel !== null`, which resolves only for a founder-offer-eligible viewer. `founder_offer_policy` has 0 rows, so it never renders, while `/pricing` hardcodes the yearly price unconditionally. | At the flip every visitor is quoted a yearly price they cannot select. | S |
| C3 | **Cancellation copy points at the wrong page.** Five customer-facing strings (Terms line 76, pricing FAQ, Stripe checkout `custom_text`, confirmation email) say cancel from plan settings; the control lives on `/settings/account`. | The `withdrawal_policy` record asserts `as_easy_as_signup`. | S |
| C4 | **A permanently lost webhook has no recovery path.** Reconcile has three callers, none a cron, admin action or checkout-return handler. Orphan path returns 200 and drops the event. | Card charged, account stays Free, no tooling to fix it. | M |
| C5 | **Consent evidence cannot be tied to a contract.** No contract reference on `billing_consent_records`; `ip`/`user_agent` declared and never written; `IMMEDIATE_PERFORMANCE_TEXT` has no hash or snapshot, so it can be edited without a version bump while CI stays green. | This is the text that makes a proportionate withdrawal deduction enforceable. Counsel will ask at final sign-off. | M |
| C6 | **Two em-dashes** in `upgrade-button.tsx:112` and `:123`. | Founder copy rule, on the one screen where a consumer commits to a recurring charge. | S |
| C7 | **`close-sales.cjs`**: a ~20-line script plus three runbook lines to revoke the launch keys. | There is a documented way to open sales and no rehearsed way to close them. | S |

---

## Stage 1: P5b appointment payments (~3-5 weeks) ← CURRENT MILESTONE

Spec: `plus-payments-architecture.md`. Every line falls under the AGENTS.md
money-path rules, which correctly slow this work down.

**First, a naming fix.** `plus-build-plan.md` uses **P5b twice**: line 69 is
shipped goods discounts, line 73 is this. A reader resolving "P5b" to the DONE
row concludes the long pole is finished. The appointment stage is renamed **P9
appointment payments** here and in the build plan; the goods letter sequence
keeps P5a-P5d.

### Slices

Each slice ends green with named per-test evidence, and each carries its own
pre-registered falsification. Nothing is marked done because it was built.

| slice | content | key risks |
|---|---|---|
| **A1 schema + pure model** | `payment_requests` (immutable revisions, the 13-state lifecycle), `payment_request_lines` (classification, tax treatment, optional linked product/order), `payment_allocations`. Shared pure functions: outstanding balance, legal state transitions, allocation invariants. | RLS write policies from the start, `TO authenticated`, drop-then-create, WITH CHECK. Composite FKs on every join table so a cross-owner row is unrepresentable even for the service role. Both of those are hard-won: see the P5d retraction and `0122`. |
| **A2 server cores** | create / revise / send / cancel / expire. Immutable-revision semantics: a reviewed request is never silently modified. Gate on the seven payment entitlement keys. | "Cancelled and replaced" vs "new revision" must be one implementation, not two that agree today. |
| **A3 quote + intent** | Server-authoritative outstanding balance; the displayed amount and the Stripe charge come from ONE quote. Idempotency keys on every Stripe call. Fee lanes through the existing `computeOrderFees`, never one rate over one total. | The two existing fee sources already disagree (`bookings.ts:853` hardcodes 300bps; `request/[token]/actions.ts:394-404` overwrites from the schedule). **Unify them in this slice**, before v2 makes the divergence visible. |
| **A4 webhooks + allocation** | Allocation written at settlement, never one unclassified total. Converge to a target, never add a delta. Idempotent under redelivery and out-of-order events. | This is where the `charge.refunded` lesson applies literally. |
| **A5 refunds by classification** | Full, partial, single line, proportional, deposit, goods, mixed. Fee-refund policy as versioned data (already exists in `fee-refund-policy.ts`). | Deposit / appointment / goods stay separate business commands even where they share utilities: their Connect semantics differ. |
| **A6 client payment page** | Itemized breakdown before paying, durable confirmation. Button copy states the amount: **"Pay €X now"**, never "Continue" or "Confirm". | Copy rules apply to every string here. |
| **A7 native twins + parity** | Mobile surfaces; `docs/web-native-parity.md` updated in the SAME change. | A new union value the app switches on is a BREAKING wire change (the `featured_collection` lesson). |
| **A8 onboarding + reconciliation** | The Plus payment-onboarding flow that creates the connected account. **Never for a Free artist**, who today can create a live Connect account they can never use. Reconciliation backstop. | Never auto-clear `stripe_account_id`. |

The spec's **27 test obligations** (§12) are the acceptance criteria, not a
suggestion. They are enumerated there; each slice claims its subset explicitly
and the final slice proves none were dropped.

---

## Stage 2: P6 insights (~2-3 weeks)

Downstream of P9 because it consumes payment actuals. Carries the **advanced
analytics** benefit, which is one of the three currently-free marketed claims
and the only one needing a real build.

Boundary is canonical in spec §19: Free gets current operational state and all
raw records; Plus gets history, comparisons, attribution, conversion and trends.
Enforce at the query and server layer, never navigation only.

Note `canSeeAdvancedAnalytics` currently has **zero call sites**, so unparking
`analytics` alone changes nothing. Build, wire both web and mobile read paths,
then unpark, with a red-then-green test.

---

## Stage 3: goods and page remainder (~3-5 weeks, parallelisable)

Bundles; the `shop` and `guestSpots` appearance surfaces that exist in the
vocabulary with no renderer; detailed sales analytics (currently a raw order
ledger). Page: `image_gallery` block type, section layouts, custom SEO fields.

---

## Stage 4: fee schedule v2 (~0.5-1 week)

**Unify the two fee sources FIRST** (see A3). Only then flip
`ACTIVE_FEE_SCHEDULE_VERSION`, as one deliberate money-path change with
accountant re-confirmation against v2 specifically. Under v1 both paths compute
600 so the divergence is invisible; under v2 they would set 600 vs 100 or 0.

---

## Stage 5: P7 commercial closure (~1 week)

Order matters here and is easy to get wrong:

1. **Refresh `plus-capability-registry.ts` first.** It has zero consumers and is
   materially stale (no row for appointment payments, goods tools still marked
   greenfield, shipped keys still labelled proposed).
2. Then write `commercial-readiness.cjs` **against the refreshed registry**, or
   the script inherits the drift. It must read LIVE production
   `DISABLED_CAPABILITIES`, not a doc string. Expected first run: FAIL.
3. Migrate the legacy `deposits` call sites onto the seven payment keys.
4. Re-run `legacy-free-recompute.cjs`, then **unpark `entitlement_caps`**.
5. **Unpark `custom_templates`.** Enforcement is already built and tested on
   both save paths; also gate `settings/emails/page.tsx`, which currently opens
   the editor for a Free artist and only fails at save.
6. Insert the `founder_offer_policy` row (0 rows today, so the offer is closed
   by default and never opens on its own).
7. G-5: complete Connect onboarding in LIVE mode and run one real card deposit.
8. Fresh iOS build (still `0.3.0(4)` from 2026-07-17, predating everything).

**Make unparking a hard precondition on recording the launch key.** Nothing
mechanically enforces that today, and it is the difference between selling three
benefits that exist and three that do not.

---

## Stage 6: P8 endgame (~1-1.5 weeks plus counsel turnaround)

Final Terms through the **versioned workflow** (bump, snapshot, re-record) or CI
fails. Checkout disclosures generated FROM finished behaviour. Submit the
finished package for the ONE counsel gate. Apply corrections. Record approvals
against the final versioned artifacts. Record `consumer_sales_launch_approved`.
Flip. Then a real verification purchase plus a withdrawal and a refund.

**Sequencing constraint that catches people:** correcting the benefit claims
means editing `terms.md`, which bumps the version and hash, which invalidates
`terms_approved` and re-closes the b2c gate until re-recorded. Correcting the
marketing is not free. Budget the re-record.

---

## Before the flip, execute these once

The audit could not verify them because they are writes, and each is exactly the
kind of claim this repo has been burned by:

- **Nobody has ever observed the production server refuse a real checkout.** The
  refusal is proven at unit level (34 tests, mocked reader) plus a live
  evaluation of the pure gate against real production rows. That is two strong
  pieces of evidence composed into a sequence, not the sequence itself.
- **The open-to-closed gate transition has never been exercised**, because the
  key has never been recorded.
- **Webhook idempotency and out-of-order convergence have never run against real
  Postgres**, only against an in-memory fake of PostgREST.
- The four engineering approval keys were recorded 2026-07-23, before the
  ordering guard, the founder-offer branch and the invoice parent path landed.
  **They certify code that no longer exists** and should be re-recorded.

---

## Honest total

**10-15 working weeks**, dominated by P9 at roughly a third. P6 is second and
cannot start early. Everything else parallelises or is small.
