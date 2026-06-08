# In-App Account Deletion — Design Dossier (2026-06-08)

Produced by a 5-agent discovery+synthesis workflow (data model, storage, Stripe, Apple/GDPR/auth).
The top App Store (Guideline 5.1.1(v)) + GDPR (Art. 17) launch blocker. **Nothing is built yet —
this is the design + the decisions that gate the build.**

## Two non-negotiable correctness facts the whole design hinges on
1. **Deleting `auth.users` does NOT cascade.** `profiles.id` is a bare uuid PK with **no FK to
   auth.users** in any of the 46 migrations. The cascade fans out only when the **`profiles` row**
   is deleted. So deletion must explicitly delete `auth.users` AND `profiles`, and the profiles
   delete must succeed or every artist table is orphaned with full PII.
2. **Storage NEVER cascades.** Objects live in two buckets (`logos` public, `bookings` private),
   all namespaced under `{artistId}/`. A DB-row cascade leaves 100% of files behind (the existing
   admin delete leaks every byte). Must be purged server-side by `{artistId}/` **prefix** (not
   row-derived paths — those rows are gone, and there are legacy goods layouts).

## What cascades cleanly (good) vs what's orphaned (must handle)
- **Cascades off `profiles` delete (client PII included):** booking_requests (+form_data,
  customer_email/handle, booking_images rows), client_notes, waitlist_entries, orders/order_items,
  slots, trips→trip_legs, studios, flash_days/items, products→variants, instagram_*, notifications,
  device_tokens, account_overrides, custom_fields, email_templates.
- **Orphaned — needs explicit handling:** (1) storage objects in BOTH buckets; (2) the external
  Stripe Connect account (`acct_*`); (3) the Instagram OAuth token (live at Meta even after row
  delete); (4) `audit_log.actor` / `admin_action_log` (bare uuids, no FK — retain as audit trail);
  (5) `mobile_waitlist` (global, may hold artist's own email).
- **RLS reality:** a user session has no DELETE policy on `profiles` and zero access to auth.users /
  storage deletes / account_overrides. **Deletion MUST run server-side with the service-role client.**

## The hard part — Stripe money safety
- Each artist is a Custom Connect account, **merchant of record**; paid deposits settle into the
  artist's connected balance (3% app fee to Inklee). The deposit FSM has **no "completed" state** —
  a paid deposit is `status='approved'` + `deposit_paid_at` set, indistinguishable from finished work.
- Deleting the booking row destroys `deposit_payment_intent_id` → the in-app refund path
  (`refundDepositCore`) and the webhook intent→booking lookup can no longer reach it → **a client who
  paid is stranded with no refund route.**
- `stripe.accounts.del` hard-fails on any non-zero balance / recent charges anyway.

## Recommended design (one shared core, three callers)
Build **one** `deleteOwnAccountCore(userId)` in `lib/server`, exposed from: (a) new
`DELETE /api/mobile/account` (mobile), (b) new web `/settings` self-service action (closes the web
GDPR gap), (c) refactor of the existing admin `deleteAccountPermanentlyAction` (today does ZERO
storage + ZERO Stripe teardown — the bug must not be re-propagated).

**Ordered sequence:**
1. Gate: `requireMobileUser` → userId from JWT; subject is ALWAYS the token's userId (never a body id). Re-confirmation validated.
2. **Money pre-flight (read-only):** live-unpaid intents + paid-unresolved deposits + Connect balance. If paid-unresolved OR non-zero balance → **409 BLOCK** (nothing mutated).
3. Snapshot `{artistId}` prefix + stripe_account_id + instagram token (before cascade).
4. Cancel live unpaid PaymentIntents (`stripe.paymentIntents.cancel`).
5. Revoke Instagram token at Meta (best-effort).
6. **Anonymize + detach** the counsel-defined financial subset (so the cascade doesn't hard-delete tax records).
7. **Storage purge** — recursive `{artistId}/` prefix in BOTH buckets, service-role.
8. Delete auth user.
9. **Delete profiles row** (the cascade trigger) — verify success or STOP.
10. Orphan sweep (audit_log.actor / admin_action_log retained as bare-uuid trail).
11. Tombstone (one admin_action_log row) + 200 → app clears session.

**Policies:** Stripe = **deauthorize-and-retain** the account (NOT `accounts.del`; schedule that for
end-of-retention-window). Financial records = **anonymize-and-retain** (strip client PII, keep
amounts + Stripe ids for the EU tax/AML window); hard-delete everything else + all storage + auth +
profiles. Mobile UX = destructive row under More→Account → full-screen confirm with **type-to-confirm
+ re-auth** → on 200 clear session+token, drop device token, route to sign-in; on 409 show what must
clear; Apple requires TRUE deletion (not deactivate / "manage on web").

## Genuine decisions (founder; several need counsel)
| # | Decision | Recommendation |
|---|---|---|
| 1 | Paid-unresolved deposits / non-zero balance at delete | **v1 BLOCK (409)** — strands no client money, no money-fronting, avoids accounts.del failure. Auto-refund = v2. |
| 2 | Hard delete vs 30-day grace window | **Immediate hard delete** (Apple-clean); deferred Stripe accounts.del at retention end. |
| 3 | Re-auth vs type-to-confirm only | **Both** (irreversible + JWT-gated). |
| 4 | Stripe account: delete vs deauthorize-retain | **Deauthorize-retain** (preserves refundability + AML records). |
| 5 | Client reference photos on artist delete | **Delete** (cron already deletes after 30d). |
| 6 | Anonymize vs hard-delete financial + exact PII set + window | **Anonymize-retain a counsel-defined subset** — **COUNSEL deliverable that gates step 6.** |
| 7 | Shared core + web parity in same slice | **Yes** — closes web GDPR gap, prevents divergence. |
| 8 | Migration/prod state | Apply **0046** + verify state; core tolerant of missing tables; full-residue integration test. |

## Hard prerequisites before MERGE
- Counsel sign-off on the retained-field set + window + the artist-MoR block policy (#1, #6).
- Migration 0046 applied + full migration state verified.
- A full-residue integration test (create an artist touching every table + both buckets + a Connect
  account → delete → assert nothing survives except the intentionally-retained anonymized set).

## Adversarial review (2026-06-08, workflow wf_06f85854-ea1)

Four parallel lenses. **Security: PASS** (no cross-user escalation; the deletion
subject is always the server-validated identity — mobile = JWT userId only, never
a body id; web = cookie session; admin = guarded target). Money / completeness /
GDPR: PASS-WITH-FIXES.

**Fixes applied (committed):**
- Stripe unreachable (`stripe===null`) with any Stripe state → refuse (was silently
  skipping the balance check + intent cancel → orphaned chargeable intent).
- Intent-cancel now verifies status and STOPS before the cascade if any intent
  isn't confirmed canceled (transient-error or race-succeeded orphan/strand).
- Forfeited deposits (`deposit_forfeited`) treated as resolved → don't block forever.
- Block on `connectedBalanceCents !== 0` (negative balance / owed-debt also blocks).
- Orders snapshot switched denylist → **allowlist** + money-state filter + a
  regression test (a future PII column can't leak into the retained archive).
- Storage `.list()` paginated (heavy accounts no longer silently miss files).
- Auth-delete failure writes a discoverable `account_auth_delete_failed` audit row.

**Documented deferrals (NOT bugs — policy / follow-up, must resolve before/around launch):**
- **Stripe `accounts.del` at retention-window end** — v1 retains the `acct_*`
  (archived with `deleted_at`) per the deauthorize-and-retain decision; the
  scheduled deletion of the Connect account (which removes Stripe-side KYC PII) is
  a deferred cron the archive already enables. Custom accounts have no OAuth grant
  to "deauthorize", so nothing to revoke at delete time.
- **Instagram token revoke at Meta** — the row + token cascade-delete from our DB;
  Meta-side revoke needs a new Graph API primitive (none exists in the codebase;
  `disconnectInstagramAction` only flips a flag). Follow-up.
- **Re-auth step-up before deletion** (v2) — today a valid Bearer session +
  type-to-confirm gate it; a leaked-but-valid token could self-delete. Add an AAL/
  nonce re-auth check. (Apple-compliant as-is; this is a security hardening.)
- **`order_items` retention** — only order roll-ups are snapshotted; line-item
  detail hard-deletes. Counsel decision #6 (whether the tax record needs items).
- **Partial-refund precision** — a dashboard partial refund logs one
  `deposit_refunded` row → treated as fully resolved (backstopped by the balance
  check). In-app refunds are full-refund-only, so low impact.

— Discovery source: workflow `wf_c6c5e5e1-a3d`; review: `wf_06f85854-ea1`.

## ⚖️ COUNSEL RULING APPLIED (2026-06-08) — `docs/account-deletion-handoff.md`

Counsel's formal opinion **supersedes** the interim engineering defaults. Code changes made:

- **§3 — money-block REMOVED (reverses the earlier "block" decision).** Erasure is
  NOT conditioned on financial resolution. Deletion **always proceeds**: no balance
  check, no "resolve your deposits first" gate, no `MONEY_NOT_RESOLVED`. Live unpaid
  intents are still cancelled (transient retry only); **every** paid deposit's record
  is retained (with a `resolved` flag) so an unresolved deposit's record preserves the
  client's refund route. (Dropped the 409 path from the mobile route + UIs.)
- **§4 — retained field set + window** confirmed: allowlist = Platform Fee amount +
  deposit amount (basis) + currency + Stripe payment-intent id + status + timestamps +
  internal booking/order UUID. Added the **Platform Fee amount** to the snapshot.
  **Retention = 7 years** from end of the transaction's financial year (Estonian
  Accounting Act §12).
- **§5 — relabel anonymised → PSEUDONYMISED** throughout code, schema, migration, tests
  (it remains in-scope personal data under Art. 6(1)(c), not out-of-scope anonymised).
- **§9 — re-authentication now REQUIRED** before delete: mobile has full provider re-auth
  (password / Apple / Google) + type-to-confirm; web has password re-auth for password
  users + type-to-confirm.

### 🔴 NON-CODE requirements from counsel — founder/legal must complete before release
- **DPIA (Art. 35)** completed + signed off — counsel says it **gates the launch**.
- **Privacy notice** updated to the §10 clauses (deletion / payments-identity / security
  records); **remove the old "plus 30 days" wording.**
- **Article 30 record** updated with the Stripe DPA + SCCs/DPF transfer mechanism.
- **Purge jobs (scheduled, not yet built):** financial records **7 years** keyed to
  financial-year-end; audit/tombstone **24 months** (the deletion tombstone lives in
  `audit_log` and must inherit a 24-month purge — confirm one exists); Stripe
  `accounts.del` at the 7-year window-end (zero balance required).
- **ToS Art. 28 processor terms** (the documented-instruction wording) confirmed present
  in the Artist Terms of Service.
- **Web OAuth-only re-auth** (no password) currently proceeds on type-to-confirm — a
  documented follow-up to add social re-auth without losing the page.
