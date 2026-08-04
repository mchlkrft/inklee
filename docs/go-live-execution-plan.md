# Go-live execution plan v2 (prepared 2026-08-04, post-counsel-answers)

**Written by the lead session for the NEXT session to execute.** This is a
runbook, not a discussion document. It SUPERSEDES the 2026-08-03 plan that
lived in this file: that plan's Phase A (release 0125-0154 + push master +
Connect webhook A4), Phase B (#79 build), and Phase E (DPIA key recording) are
**DONE and verified**; its Phase C question (round-5 Q1) is **ANSWERED**; its
Phases D, F, G are absorbed and re-sequenced below. History is in git.

**Sources of truth.** `docs/go-live-path.md` is the position/ordering SoT.
`docs/legal/counsel-master-package-2026-08-04.md` **§6** is the counsel-rulings
SoT — every ⚖️-derived instruction cites a §6 ruling; if this file and §6
disagree, §6 wins and this file gets fixed. Where this file and
`go-live-path.md` disagree, STOP and reconcile before acting.

**Who does what.** 🧑 FOUNDER = Michel's acts; you prepare and verify, you never
perform them. ⚖️ COUNSEL = wait on counsel. 💶 ACCOUNTANT = accountant act.
Everything else is engineering. **Never** record or void an approval key, push
master, apply anything to production, flip a flag, or publish a Terms/privacy
version without the founder's explicit go IN THE EXECUTING SESSION's
conversation (a doc saying it is planned is not a go).

---

## Standing rules for the executing session

1. **Invisible-work check before building ANY item:** `git branch -a`,
   `git worktree list`, `git status --porcelain`. The four sibling checkouts
   (`A:\WORK\inklee-hotfix`, `-booking`, `-founding-artist-beta`,
   `-studios-guestspots-map`) have still never been swept.
2. **Do not re-ask counsel anything answered.** Master package §5 lists the
   settled set; §6 answers everything from rounds 5-6. Round numbering is
   per-round (round-5 Q1 ≠ round-2 Q1).
3. **Migration discipline:** next free number is **0156** (verified 2026-08-04;
   0154 and 0155 both exist and are applied to prod). Convergent guards only
   (AGENTS.md footguns; `0122` is the reference); `insert ... on conflict ... do
   update` on a unique index is the convergent seed shape. Prod applies go
   through the release-sequencer under explicit founder go, atomic with the
   ledger row, catalog-verified after — **exit 0 proves nothing**.
4. **Copy rules apply to counsel-approved wording too** (no em-dashes, sentence
   case, Accept/Pass, terminal punctuation on sentences; search the diff for
   `—`). Counsel's approved shop-variant text contains an em-dash: normalize
   TYPOGRAPHY ONLY (words identical), and disclose the normalization in the C1
   cover note (M2) so sign-off is against the final rendered form.
5. **Every commit runs the full web build in the pre-commit hook (~5-10 min)**
   when web/packages files are staged; docs-only commits skip it. Budget bash
   timeouts accordingly (the TypeScript step alone can take 3+ min). Never
   `--no-verify`.
6. **Every review/verification updates `docs/audit/findings.yaml`** (findings
   with citations; a clean pass still writes a coverage row). Validate with
   `pnpm audit:validate`, regenerate with `pnpm audit:generate`. Regenerate
   AFTER committing findings.yaml or the report carries a stale "uncommitted"
   banner that fails `audit:check` in CI. You do not verify your own fix.
7. **Native-affecting changes update `docs/web-native-parity.md` in the same
   commit.** A new value in a union the app switches on is a BREAKING wire
   change (needs a fresh EAS build to grant); a new field is not.
8. **Local database:** `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres`;
   db suite via `pnpm test:db` in `apps/web` (env from `.env.e2e`). Migrate the
   local db through 0155 before relying on it.
9. **The repo is PUBLIC.** `docs/market-analysis/`, `scripts/market-analysis/`,
   the zips and `*-chatgpt/` packs are deliberately untracked (internal
   traction data). NEVER `git add docs/` or `git add -A` broadly — stage
   explicit paths, or you will sweep them into a public commit (this happened
   2026-08-04 and was caught only on review). Leave them unless the founder
   decides otherwise.
10. **Ledger writes:** `record-approval.cjs` can only write `approved=true`;
    `close-sales.cjs` voids the two launch keys only. Voiding any OTHER key is
    direct SQL via the sequencer (`set approved=false`, append a dated note —
    never delete the row; the ledger is evidence).
11. **If a step's verification fails, STOP that phase and report.** No
    improvised prod repair; never `migration repair --status applied` or "re-run
    the migration" without reading the AGENTS.md footguns.
12. **Doc-lag rule.** Several worklist checkboxes lag verified facts (Phase 0).
    Trust the verified evidence, then FIX the doc in the same change.

---

## Phase 0 — Position check (verified 2026-08-04 by the lead; re-verify on start)

| Position | Verified value | Re-verify with |
| --- | --- | --- |
| Prod migrations | through **0155** (ledger 154 rows, one 0155) | `select max(version) from supabase_migrations.schema_migrations` |
| Ledger | 22 rows: b2b 7/7 ✓, b2c 7 rows (missing ONLY `consumer_sales_launch_approved`), technical = 4 stale keys + 4 DPIA keys ✓ (R1/R3/R4/R6, "Management board (M. Kraeft)", 2026-08-04) | read-only select on `billing_activation_approvals` |
| Absent keys | `consumer_sales_launch_approved`, `business_sales_launch_approved`, `fee_processing_subsidy_claim_approved` | same |
| `PLUS_CONSUMER_LAUNCH_ENABLED` | **compile-time const `false`** at `plus-launch-config.ts:13` (NOT an env var; flipping = code edit + deploy). Visibility-only; the money control is the ledger gate. | read the file |
| `GOODS_COMMERCE_ENABLED` | env var, fail-closed, **unset in prod** | `features.ts:127-128`; Vercel env |
| `DISABLED_CAPABILITIES` (live) | `custom_templates,analytics,entitlement_caps` (branding NOT parked) | GET `https://inklee.app/api/mobile/config` |
| Terms | live version **2026-07-24**, 20 sections, no Goods section; dark-launch sentence :80; buy-as-business sentence :79; "Section 13 applies" cross-ref :73 | read frontmatter |
| privacy.md | version **2026-07-11**; snapshot-frozen + CI-enforced like all 7 docs, but hash-BOUND to no approval key (terms only, `artifacts.ts:38-45`) | `documents.ts:47-69` |
| #91 (3% fee) | **live charge exists**: `ch_3U0H4fHkG0exykzF1tTcZvJZ` 2026-08-03T08:19Z, 100c, `application_fee_amount=3`, no sponsorship, **unrefunded**. Contradicts `go-live-path.md` §4 "never produced". Closure not executed. | Stripe API read-only |
| FA4 dispute events | **subscribed** on live endpoint `we_1TpPmyHkG0exykzFYTq26SyV` (`created/updated/closed`); handler `webhook/route.ts:349` | Stripe API |
| FA6 deposits key | **converged**: 0 rows needing migration | read-only select |
| FA2 G-5 | DONE 2026-08-03 (live deposit + refund verified) | `docs/launch-gate.md` |
| EAS | latest `7faa73ca` (2026-07-30, commit `b461d4db`) — **42 mobile commits behind**; missing FD12 revise, bundles checkout, gallery, R3 native attestation, custom_made parity | EAS API |
| §7.5 unreadable balance | **built** in 0153 (`connect-account-teardown.ts:130-133,205-229,344-356`); counsel §1E's "Stripe support incident" addition NOT encoded | read the module |
| R5 Q4 sentence | **present + test-pinned** on the model-form page + receipt; Terms half rides C1.9 | run its test |
| BILL-CONF-001 | Sentry warning EXISTS (`withdrawal.ts:379-392`); **resend runbook DOES NOT exist**; `snapshot_unreadable` case not DB-detectable; `withdrawal.ts:234-236` cites a "check 11" backstop that does not exist | grep docs/ |
| creditnote key | `consumer_refund_creditnote_tested` recorded 2026-07-25 by Engineering **before any executed evidence existed** (none in repo) — same defect shape as R5 Q6 | ledger + repo grep |

Also on start: read master package §6 in full, and `git log --oneline -15`.

---

## Phase H — Implement the counsel answers (engineering; only H3 has a prod-apply gate)

### H1. Shop empty-state panel — R5 Q1 ruling (c) ⚖️ §6.2

Counsel: (c) is the ONLY compliant option; variants approved verbatim
(typography-normalize per rule 4); derive at render, never cache.
- Site: `shop-checkout.tsx:149-151` — the `disclosure === "empty"` PICK-step
  branch renders the full return notice. Only that case changes; the pay-step
  uses basket-fixed `phase.disclosure` (correct as-is).
- Catalogue composition is ALREADY in scope (props `products`/`bundles`, each
  with `customMade`; server select `checkout/page.tsx:133-141,160,276-277`). No
  extra fetch. Page is a dynamic server component (guest cookie, no ISR), so
  per-request recompute is structural — say so in a comment.
- Implement as a PURE function in `packages/shared/src/consumer-disclosures.ts`
  (beside `CUSTOM_MADE_NOTICE` ~:167-196): summarize `[...products,...bundles]`
  → `all_custom` | `mixed` | `all_returnable`, rendering: all-custom →
  `CUSTOM_MADE_NOTICE`; fully-returnable → `returnRightNotice()`; mixed → a NEW
  shop-level constant (counsel's words, typography-normalized): "Some items in
  this shop are custom-made and cannot be returned. The 14-day right of return
  applies to all other items. Details at checkout."
- Include sold-out + upcoming rows (they are rendered catalogue rows); bundles
  use their every-component-custom rule.
- Tests in `consumer-disclosures.test.ts` (no DOM harness for this surface — the
  reason the logic must be a pure shared function): all three states, empty
  catalogue, wording-verbatim pins. Extend the inline-select drift guard if the
  checkout page's `PUBLIC_SHOP_PRODUCT_SELECT`-equivalent select is touched.
- Close R5 Q1/C5 in worklist + register (cite §6.2).

### H2. DSA procedure + acknowledgement copy — R6 Q2/Q3 ⚖️ §6.4

- `docs/dsa-moderation-procedure.md` (bump v4, dated):
  - §4 (:150-154): add the image_without_consent line — acknowledge 24h
    (unchanged); "we aim to decide within 72 hours" (an aim, NOT a firm SLA);
    plus the interim rule: where the image is manifestly intimate or the report
    credible on its face, temporarily disable it on receipt pending decision
    (procedure only, not public copy).
  - §6: keep the Art. 19 / Section 3 line (:163); the trigger row cites **Art.
    29 / Section 4**; both stay, clearly separated (§6.4 "correct nothing").
  - Correct the round-6 "we built the row" overstatement (deliberately unseeded
    pre-answer) and the stale :98-100 cross-ref (DPIA was corrected 2026-08-04).
- Ack copy `apps/web/src/app/legal/report/actions.ts:172`: for
  `image_without_consent` only, qualify "within a reasonable time" with the 72h
  aim (sentence case, no em-dash). Extend the action tests (line present for the
  new category, absent for others).

### H3. Seed the DSA §4 threshold row — R6 Q1 ⚖️ §6.4, then 🧑 prod apply

- **Migration `0156`** — convergent seed into `tax_thresholds`
  (`on conflict (threshold_type, coalesce(country,'')) do update`):
  `threshold_type='dsa_micro_small_2003_361'`, `limit_minor=1000000000`
  (EUR 10,000,000), `warning_minor=800000000` (EUR 8,000,000, counsel's 80%),
  `currency='eur'`, and `notes` carrying the three things the shape has no
  columns for: (1) second limb — < 50 staff, status lost if EITHER limb is
  exceeded; (2) Rec. 2003/361 Annex Art. 4(2) — two consecutive accounting
  periods before status changes, so an alert is a review trigger; (3) citation
  DSA Art. 29 / Section 4.
- Migration comment AND procedure note the limitation: the rollup
  (`tax-threshold-rollup.ts:203-206`) auto-updates ONLY `ee_registration_40k`;
  this row's `current_minor` is the quarterly manual check. Extending the
  rollup is parking-lot.
- Local db test (row present, warning < limit, notes non-empty), then 🧑
  founder-gated prod apply via the release-sequencer (atomic with ledger 0156,
  catalog-verified). Close worklist B2 (cite §6.4).

### H4. Interim-disable mechanism for reported gallery images (needed by H2's rule)

No mechanism exists (verified): no per-image row, no hide flag; render is
signed-URL-only, 15-min TTL. Build **render-time suppression** (option b — no
schema change, auto-reverts on dismiss, no restore-sweep hazard):
- Before signing, filter out gallery URLs with an OPEN `content_reports` row
  (`category='image_without_consent'`, `status in ('new','reviewed')`) matching
  the URL. One service-role query in the signing path/callers; dormant today
  (0 gallery blocks) — build it now while dark.
- Do NOT reuse `stripImageFromBlocks` (irreversible) or per-image archive moves
  (`restoreArtistGallery` would silently re-enable — verified hazard).
- 15-min residual: already-minted URLs survive to TTL; state that bound in §2b.
- db test: reported image dropped from the signable set; dismissed report
  restores it; other categories unaffected.

### H5. Encode counsel §1E's addition into the teardown escalation ⚖️ §6.5

The unreadable-balance fold is BUILT (0153). Add the addition: a *persistently*
unreadable balance (beyond the retry window) is an operational incident to raise
with Stripe support at escalation time — extend
`UNREADABLE_BALANCE_REASON.resolutionRequires` (`connect-teardown-escalation.ts:123-128`)
and the case-note text; one line in the ops procedure. Test pins the wording.

### H6. BILL-CONF-001 resend runbook (counsel condition, half-met) ⚖️ §6.8

Counsel: the residual is acceptable ONLY IF the degraded path emits a monitoring
event (it does — Sentry warning) AND a corrective resend is in the runbook (does
not exist — the gap).
- Write `docs/runbooks/billing-confirmation-resend.md`: trigger = the Sentry
  message "Plus purchase confirmation sent without inline Terms text" (both
  `reason` values); detection — `no_terms_version` is queryable
  (`terms_version IS NULL AND delivery_status='sent' AND stripe_invoice_id IS
  NOT NULL`), `snapshot_unreadable` is NOT DB-detectable (row looks healthy;
  Sentry is the only record, `payload_hash` the forensic fallback); action =
  regenerate + resend with the Terms text, record the resend.
- 🧑 founder todo IN the runbook: configure a Sentry ALERT RULE on that message
  (it is `level: warning` — without a rule it is a breadcrumb, not a monitor).
- Fix the false comment `withdrawal.ts:234-236` ("check 11" — no such check);
  point it at the runbook.
- Register: BILL-CONF-001 residual → runbook-covered; disclosed in M2.

### H7. SEED-DEL-001 — time-boxed investigation ⚖️ §6.7 (deadline **2026-08-11**)

One pass over what is still readable (Supabase logs/audit trails, pg catalogs,
admin-action history) for the 1,363-row deletion mechanism. Either outcome, the
register row CLOSES with a dated record: mechanism found → record it; not found
→ record "unexplained privileged write access, mechanism undetermined" AND pair
it with the compensating control per counsel — scope or rotate the
eleven-endpoint credential, recorded as ONE finding with the deletion. Does not
stay open/not-started a third round.

### H8. Art. 33(5) records (round-3 owed work; proceeds as instructed, §6.7)

Not a gate, but overdue: the Q9 sibling record (cleanup retention guard +
discarded deletion reads) with the waitlist-sweep result and the **Stripe
cross-reference** ("did any deleted account have financial activity requiring
retention?"); the hosting deployment-history lookup; population context + formal
standing for both records; the 90-day logging-review date in the Q10 memo;
resolve the 8-deletions figure. Spec: round-3 §6.2/§7.3.

---

## Phase I — The C1.9 legal-version edit (ONE version bump, sent once)

Preconditions: H1 merged (Terms describe the shop the code ships); §6.1 answers
in hand. Input package: `docs/legal/c1.9-terms-edit-inputs.md` — its own
execution checklist governs, with these §6 resolutions applied.

### I1. privacy.md — R5 Q5 ⚖️ §6.1

- The C1.4 guest-buyer text goes in **`content/legal/privacy.md`**. Fold in the
  guest-order + guest-cart/wishlist processing (align with
  `docs/legal/records-of-processing-guest-shop.md`), retention (7-year for
  completed orders; the cancelled-order purge window), recipients (artist,
  Stripe).
- Bump privacy frontmatter version + freeze `_versions/{new}/privacy.md` (CI
  enforces byte-identity).
- **Hash-bind it now** (counsel's words): add privacy's `versionHash` to
  `getCurrentBillingArtifacts()` (`artifacts.ts`) under a new version-bound key
  (`privacy_notice_approved`), add the [db] check to
  `verify-legal-artifacts.cjs`, add the key to `VERSION_BOUND` in
  `record-approval.cjs`. Recorded at C1 (M3), bound to the new hash. Binding ≠
  gating: do NOT add it to the REQUIRED b2c set without a founder/counsel call
  on gating semantics; note that in the cover note.

### I2. terms.md — the single bump, ALL riders ⚖️ §6.1, §6.8

Per the input-package checklist steps 1-1c PLUS the five §6.8-confirmed
mandatory riders:
1. New **Section 13 "Goods orders"** (input draft as base): seller
   identity/address obligation, goods return right + Art. 16(c) per-product
   flag, return-cost allocation, buyer-invoice line (A5), the Q7 forwarding
   clause **artist-directed as drafted** (Q4: accepted; the buyer-side sentence
   lives on the model-form page, verified present + test-pinned — nothing
   further).
2. Renumber 13-20 → 14-21 AND retarget the §11 cross-ref at :73 ("Section 13
   applies" → the renumbered Availability section, now 14). Verified break
   point; do not miss it.
3. Q12 deletion bullet into Section 11 INCLUDING the Q2 sentence (ruling: IN):
   "Deleting your account is never held up by a refund. If the refund cannot be
   completed at the time, we keep the limited records needed to pay it and
   complete it afterwards."
4. Q3 (§6.1): ratified (a) — Terms STAY SILENT on withdrawal-window arithmetic;
   the full refund where no immediate-performance consent exists is
   Art. 14(4)(a)-required. **No code change; add no pro-rata sentence.**
5. Q20 P2B section (input draft; its three open points resolve in the pass).
6. X2: line 76 "plan settings" → "account settings".
7. Rider 1 — dark-launch sentence (:80): REPLACE with a state-independent
   accurate sentence (proposed render for counsel: "The online withdrawal
   function is available from your account settings."). No launch-state claim
   either direction.
8. Rider 2 — goods-fee coverage: v2 goods rates (Free 5% / Plus 1%) + the 30-day
   advance-notice mechanism (AC3 condition; the notice CLOCK starts at
   publication — Phase O).
9. Rider 3 — DPIA R2 artist-Terms clause: client-photo consent is the artist's
   continuing obligation (strengthen §6/§9 beyond the generic line).
10. Rider 4 — fix the §11 falsehood "you buy as a business and you confirm this
    at checkout" (no such control ships; D1 deferred it). Reword to reality.
11. Bump version + freeze snapshot; run `verify-legal-artifacts.cjs` + integrity
    tests. `terms_approved` re-closes automatically (version-bound) — expected;
    re-records at M3 only after the as-deployed condition holds.

Deliverable of Phase I: the final RENDER for counsel — it goes inside the M
package, not sent alone.

---

## Phase J — Evidence capture

### J1. Credit-note flow evidence (verified recipe)

Test mode, local: `next dev` (NODE_ENV != production) + test key +
`stripe listen --forward-to localhost:3000/api/stripe/billing-webhook`; verify
`tax_policies` has an `is_current=true` row FIRST (else the credit note silently
no-ops).
1. Subscribe a REAL internal test auth user via the real consumer checkout
   (gates are test-mode no-ops) with the immediate-performance box TICKED
   (stamps `immediate_performance:"true"` — REQUIRED for a PARTIAL refund).
   Do NOT use `e2e-subscription.cjs` as-is (business metadata, no immediate
   flag, and its cleanup CASCADE-deletes the evidence row).
2. Wait ≥ ~75 minutes (3.00 EUR monthly ⇒ ~1 cent retained; sooner rounds to a
   full refund).
3. Withdraw: `POST /api/mobile/billing/withdraw {"confirmed":true}` with the
   user's bearer token (this route is NOT behind the launch flag — no flip).
4. Export the `transaction_tax_snapshots` `kind='credit_note'` row (negative
   amounts, `corrects_snapshot_id` set), the `withdrawal_cases` row
   (`stripe_refund_id`, `tax_correction_snapshot_id`), the Stripe test refund →
   `docs/audit/evidence/` with dates + ids.
5. This evidence backs re-recording `consumer_refund_creditnote_tested` (K2).

### J2. Checkout screenshots — counsel's standard ⚖️ §6.8(1)

Standard: production build at the RC commit, launch flag enabled for an internal
test account, commit hash recorded. The flag is COMPILE-TIME, so the flip must
itself be a commit (which the standard tolerates and which IS the cleanest
evidence of "flag enabled").
- Branch = RC commit + one child commit flipping `plus-launch-config.ts:13` to
  `true`. Vercel preview of that branch (preview env carries the TEST Stripe key
  — required, else BILL-UI-003 renders the blocked-price state, the wrong shot),
  or local `pnpm build && next start` of it.
- Sign in as an internal Free-tier test account. Capture `/settings/plan`: the
  opened upgrade panel (total + interval + auto-renewal + "What you get"
  directly above the order button) and the UNTICKED immediate-start checkbox
  (same panel, `upgrade-button.tsx:173-186`); and the order-button wording.
  Record BOTH commit hashes with the images.
- Render does not read the approvals ledger (verified) — a closed gate does not
  block the capture. Do NOT click through on any live-key build.

### J3. E1-E5 + durable-medium bundle

Collect the as-deployed E1-E5 texts, the Art. 8(7) inline-set evidence
(existing coverage, `56980a8`), and the BILL-CONF-001 disclosure + runbook ref
(H6). Collection only; no new verification.

### J4. Goods evidence set

From the deployed dark surfaces (they render in preview behind the env flag):
obligation-to-pay button, seller block, per-row custom-made markers + the
post-H1 catalogue-state panel (all three states), the conforming receipt render,
the guest privacy notice at the email field, the purge jobs
(`shop-retention.ts` + cron), the withdrawal-form page. Screenshots + file:line
into `docs/audit/evidence/`.

---

## Phase K — Ledger hygiene (🧑 founder-gated prod writes via the sequencer)

### K1. Void `consumer_withdrawal_copy_approved` — ⚖️ §6.3 ("void and re-record. Not a cover-note explanation.")

Direct SQL: `update billing_activation_approvals set approved=false, notes =
coalesce(notes,'') || ' | VOIDED per counsel master-package §6.3: recorded
2026-07-25 before its attached preconditions (E2, C2); re-record at C1 against
deployed artifacts.', updated_at=now() where
approval_key='consumer_withdrawal_copy_approved';` Read back. Harmless while
`consumer_sales_launch_approved` is absent. Re-record at M3 with the E2 + C2
evidence, bound to the CURRENT `withdrawal_policy` version label at that time.

### K2. Same principle, `consumer_refund_creditnote_tested` (disclosed extension)

Verified: recorded 2026-07-25 by Engineering BEFORE any executed
withdrawal+partial-refund evidence existed (none in the repo) — the same defect
shape §6.3 ruled on. Void with a dated note, re-record after J1's evidence
exists, and DISCLOSE the extension of counsel's §6.3 principle in the cover note
(M2) rather than silently generalizing it.

### K3. Re-record the 4 technical keys against the RC — FA8/F10

`schema_deployed, webhook_tested, reconciliation_tested, isolation_tested` are
dated 2026-07-23, eleven days before the RC. After the RC is cut (post-Phase I
merge): re-run the four verifications against the deployed RC, then 🧑 re-record
each with an evidence_ref naming the RC commit. Precondition for M's clean chain.

---

## Phase L — Founder checkpoints 🧑 (parallel to H-K unless noted)

| # | Act | Detail / deadline |
| --- | --- | --- |
| L1 | **Initial + date the DPIA's 2026-08-04 corrections**, THEN commission the independent DPIA review | ⚖️ §6.6(1): a signed instrument amended post-signature without re-execution is a records defect. Reviewer sees it only after the initials. Reviewer = external qualified (not the drafting side). |
| L2 | **Schedule the LO-10 round** | ⚖️ §6.6(2): within two weeks (≤ **2026-08-18**). HARD BOUNDARY: no beta artist takes real client money before it closes. Forfeiture item arrives with the time-graduated/capped shape as working draft. |
| L3 | **DPIA-GAL-002 decision** | Counsel recommends **(a) wire the guard** (§6.8): call `assertDpiaPreconditionsMet('gallery')` in the gallery grant/upload path (natural site: `requireGalleryEntitlement` + save gate), making the recorded keys load-bearing. On (a): engineering wires + tests (all four keys present, nothing breaks). On (b): the §7 amendment follows the L1 initial-and-date rule. |
| L4 | **Comp/test account grant scope** | Whether `90f7500c` (internal/test) keeps `rich_content_blocks` pre-launch. Decide before the gallery opens generally. |
| L5 | **#91 close-out** (~5 min) | Wire evidence EXISTS (Phase 0). Confirm the 08:19Z charge was the deliberate run; refund `ch_3U0H4fHkG0exykzF1tTcZvJZ` (still unrefunded); confirm sponsorship re-enabled; record in `plus-build-time-decisions.md`; close #91 in the register; CORRECT the two stale docs (`go-live-path.md` §4, `launch-gate.md`). |
| L6 | **FA7 founder-offer row** | Release-time production insert (0 rows today); offer stays closed until then. |
| L7 | **Sentry alert rule** | For the BILL-CONF-001 warning (H6 names it). |

---

## Phase M — Assemble and submit the C1 package ⚖️ (one shot)

Preconditions: I complete (final render), J complete (evidence), K1/K2 voids
done, K3 done-or-scheduled against the RC, L1 done (initialled DPIA in the pack).

**M1. Seven components** (CL1 checklist, all now producible): (1) final Terms at
the new hash (I2) + new privacy version (I1); (2) checkout screenshots + hashes
(J2); (3) E1-E5 + Art. 8(7) + BILL-CONF-001 disclosure (J3); (4) credit-note
evidence (J1); (5) goods evidence incl. the H1 panel (J4); (6) ledger: the
K1/K2 voids + K3 re-records + the clean-chain query; (7) CL6 photo controls +
the initialled LO-5 DPIA + the four recorded DPIA keys.

**M2. Cover-note disclosures** (each already ruled or verified — none is a new
question): (1) DPIA amended post-signature, initialled per §6.6; (2)
DPIA-GAL-001 "never granted"→"never exercised", account founder-confirmed
internal/test; (3) DPIA-GAL-002 + the founder's L3 decision; (4) BILL-CONF-001
residual + runbook + alert rule; (5) the em-dash typography normalization of the
§6.2 wording; (6) the K2 extension of the §6.3 principle; (7) Q18 delivered
stronger (signed URLs shipped instead of the dated fast-follow; the option-(i)
nightly audit is therefore not owed); (8) C1.6 hosting grant — BOTH conditions
discharged (R4 + Q16/R1), shown not assumed; (9) provenance: the DPIA sign-off
is controller/founder-verified; the independent review (L1) is commissioned, not
concluded.

**M3. Submit → corrections → record.** After counsel confirms against the final
artifacts, and ONLY after the as-deployed condition holds (RC pushed, 0156
applied, J2 screenshots from the RC build): 🧑 record `terms_approved` (new
hash), `privacy_notice_approved` (new key + hash), re-record
`consumer_withdrawal_copy_approved` and `consumer_refund_creditnote_tested` with
evidence refs. Any counsel correction touching a legal doc re-rolls the version
and repeats M3's binding — the design working, not a failure.

---

## Phase N — Accountant tie-offs 💶

Answered in substance (2026-08-01 batch); what remains is acts + clocks:
- **AC3 / FA11 precondition:** v2 fee-schedule sign-off against v2 AS ENCODED
  (FD11 rates) + the Terms coverage (I2 rider 2). The **30-day advance-notice
  clock for the Free goods 5% fee starts when C1.9 publishes**; FA11 cannot flip
  before it elapses.
- **AC7:** 🧑 record the 0.5%-rate subsidy intent
  (`fee_processing_subsidy_claim_approved`, absent today); the
  "(card processing included)" claim stays suppressed until recorded and is
  BOUND to `fees.payer: application`, not the rate.
- **AC8:** retained-processor-cost as its own credit-note line — confirm before
  the refund-policy v1 flip (pairs with CL7's Terms half in I2).
- A1/A2 records exist; nothing further unless the C1-adjacent accountant read
  raises something.

---

## Phase O — Activation ladder 🧑 (strict order; each step one-way)

```
O1  unpark DISABLED_CAPABILITIES (drop custom_templates, analytics, entitlement_caps)
      └─ F4 tail: re-run the legacy grandfathering recompute IMMEDIATELY before
         cap enforcement goes live (usage moved since the dry run)
O2  K3 done (4 technical keys re-recorded vs the RC)  +  M3 re-records green
O3  record consumer_sales_launch_approved   ← recorder REFUSES while any marketed
      capability is parked (exit 3), so O1 strictly first
O4  flip PLUS_CONSUMER_LAUNCH_ENABLED  (CODE EDIT + deploy — compile-time const,
      no env flip)
O5  = consumer Plus sales LIVE (checkout asserts read the ledger at action time)
──────────────────────────────────────────────────────────
O6  GOODS_COMMERCE_ENABLED=true (Vercel env + redeploy) — pre: H1 deployed, C1
      signed (M3), FA2 ✓, CL3/CL5/CL6 built ✓; NOT gated on EAS (guest web
      surface). Capability GRANTS (goods_collections/goods_bundles/gallery
      blocks) STAY gated on FA3 fresh EAS build (42 commits behind, wire hazard).
O7  FA11: ACTIVE_FEE_SCHEDULE_VERSION → v2 — pre: AC3 signed, 30-day notice
      elapsed (clock from C1.9 publication)
O8  fee-refund policy → v1 — pre: CL7 Terms live (I2), AC8 confirmed
──────────────────────────────────────────────────────────
STANDING BOUNDARY (⚖️ §6.6(2)): no beta artist takes real client money before
LO-10 closes. O5-O8 for the FOUNDER's own accounts is inside the boundary;
external artists are not, until LO-10.
GALLERY LANE (separate): L3 wiring + L4 scope + FA3 build + capability grant.
```

---

## Parking lot (tracked, blocking nothing)

- R6 purge cron first-run proof: `retention_purge_runs` ≥ 1 row on
  **2026-08-10**; absence = investigate.
- Pre-login §312k cancellation route: accepted founder risk, dated fast-follow;
  TRIPWIRE = any German-locale build or German marketing.
- C9 renewal reminders: pre-YEARLY-plan only (§6.8 closed for monthly); monitor
  the Digital Fairness Act alongside.
- `charge.dispute.funds_withdrawn/funds_reinstated` not subscribed (handler
  accepts them) — optional dashboard add.
- Extend `runTaxThresholdRollup` to compute the DSA row's `current_minor`.
- Ops runbook for the content_reports insert-and-retry-both-fail case;
  Art. 17 statement delivery is manual until automated.
- `recordEscalationReview` operator surface (#86; first needed ~2033).
- Sweep the four sibling checkouts for invisible work (never done).
- Doc-lag fixes owed with their phases: worklist FA2/FA4/FA6 checkboxes,
  `go-live-path.md` §4 + `launch-gate.md` #91 (L5), round-6 "we built the row"
  (H2).

## Dependency graph

```
H1 ─► I2 ─► (RC cut) ─► J2 ─► M ─► M3 records ─► O3 ─► O4/O5
H2 / H3(+🧑 apply) / H4 / H5 / H6 ──────────────┐            O1 ─┘
I1 ──────────────► M                             ├─► C1 package
J1 ─► K2 re-record ──────────────────────────────┤
K1 void ─► M3 re-record ─────────────────────────┤
K3 (vs RC) ──────────────────────────────────────┘
L1 ─► DPIA review commissioned (runs independently; not an O-gate)
L2 ─► LO-10 ─► lifts the beta-money boundary (post-O5/O6 scale-up)
H1 deployed + M3 ─► O6 (goods)     ·     AC3 + 30-day clock ─► O7
H7 closes 2026-08-11 regardless of everything else
```
