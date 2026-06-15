# Mobile audit #2 — post-foundation feature build (2026-06-08)

Second quality audit, run after the first (`mobile-audit-2026-06-08.md`). Scope =
everything committed on `feat/mobile-e1` **since `fd27de7`** (the More-tab commit):
the harden+foundation pass, account deletion + its counsel rework, notifications,
books toggle, insights, waitlist. ~3,470 insertions / 54 files.

Method: 4 parallel review agents (code-quality/consistency · security of the new
write-paths · architecture/foundation-usage · adversarial account-deletion
re-verify), cross-checked against an independent read of all 54 changed files.

## Verdicts

| Lens | Verdict | Grade |
|---|---|---|
| Code quality & consistency | PASS-WITH-FIXES | B+ |
| Security of new write-paths | **PASS** (no cross-tenant write possible on any new endpoint; deletion subject is always the JWT userId; retained record carries no client PII) | A |
| Architecture / foundation usage | PASS-WITH-FIXES (foundation genuinely adopted, two stubs left unwired) | B+ |
| Account-deletion re-verify | PASS-WITH-FIXES (counsel rework faithful; one HIGH retention gap) | B+ |

Net: the rapid build held quality well above typical "built fast" output — real
optimistic+reconcile caching, shared types on both sides, RN/Hermes hazards
handled, allowlist-not-denylist PII retention. The cost of speed showed up as
consistency drift, copy-paste UI, and two installed-but-unused foundation stubs.

## Findings & disposition

### Fixed this pass (verified: both typechecks, 10/10 deletion tests, lint, Android bundle)

| Sev | Finding | Fix |
|---|---|---|
| **HIGH** | `account-deletion.ts` — the `deleted_account_records` insert (the ONLY DB-side survival of the counsel-mandated 7-year record **and** of an unresolved deposit's `payment_intent_id` = the client's refund route) was best-effort `try/catch`-swallow, yet the irreversible profile cascade still ran. A failed insert (most realistically migration 0047 unapplied at runtime → "relation does not exist", or a transient DB error) destroyed the mandated record + refund pointer silently. | Made step 3 **fatal when there is money to retain**: on any `orders` read error or archive-insert error, return a transient `ERROR` **before** the step-4 cascade (nothing irreversible has happened yet; intent cancels are safe to repeat). |
| MED | `waitlist/[id]` POST returned `200` even when 0 rows matched (foreign/nonexistent id) — RLS already blocks the cross-tenant write, but the success was misleading. | `.select("id")` after the update → `404` when no row matched. |
| MED | Server routes for `notifications`/`analytics`/`waitlist` GET returned untyped inline objects — the shared types were enforced **only** client-side (the contract could drift server-side). | `const body: MobileX = {…}` on all three (mirrors `home/route.ts`). |
| MED | `notifications` screen shipped with **no retry button** on its error state, while its 3 sibling screens had one — the single most important error affordance drifted. The retry block was also copy-pasted verbatim across 3 screens with a hardcoded "Try again". | Extracted `src/components/ErrorState.tsx` (routes label through `t()`); adopted in notifications / insights / waitlist / more. Killed the dup + the drift + the hardcoded string in one move. |
| MED→LOW | `BookingActions` swallowed all 4 booking-mutation failures (accept/deposit/refund/cancel) and the irreversible `delete.tsx` catch reported nothing — the failures you most want once Sentry lands. | Added `captureError` to all 4 BookingActions catches + the delete catch. |
| LOW→safety | On a shared device, OAuth re-auth swaps the session, so `delete.tsx` could delete the **newly-signed-in** account rather than the one shown. | Pin `accountToDeleteId` at mount; after re-auth, refuse if the fresh session user id differs. |
| LOW | Three stale comments still described the pre-counsel "block on money" behavior (web `actions.ts`, `account-deletion-logic.ts` `paidUnresolved`); the DELETE route comment overstated re-auth as a server guarantee. | Corrected all three to the current behavior. |

### Deferred (tracked; not blocking) — need a deliberate pass or a product/design decision

- **Server-bound re-auth** (MED, account-deletion lens): re-auth is UI-only on every
  surface; the DELETE endpoint trusts a valid Bearer session + the confirm token and
  does **not** verify re-auth freshness/AAL. A leaked-but-valid token could delete
  without re-auth. This is the documented §9 deferral. Real fix = client mints a
  short-lived re-auth proof (fresh token / server nonce), verified server-side. Comment
  now states the gap honestly.
- **`analytics.track()` is dead** (MED): a typed event taxonomy exists
  (`booking_accepted`, `deposit_requested`, …) but has **zero** call sites. Decision
  needed: wire it (screen_view + sign_in + the booking/deposit mutations) or drop the
  lib until the events endpoint exists. Deferred to a focused pass so it's wired
  consistently, not half.
- **i18n debt is growing** (MED): the catalog is still ~11 keys (tabs/errors); ~38
  user-facing strings added today are hardcoded English (the account-deletion legal
  copy is the most important to localize). Stop-the-bleed: route new strings through
  `t()` going forward.
- **Optimistic-mutation patterns diverge** (MED): notifications / books / waitlist each
  hand-roll `setQueryData` + try/catch with a different rollback strategy (notifications
  has none). Standardize on a `useMutation` (onMutate/onError/onSettled) wrapper.
- **`settings/books` read-modify-write** (LOW): merges the whole `profiles.settings`
  jsonb blob → a concurrent settings write could clobber. Acceptable for solo/single
  device v1; harden later with a `jsonb_set` RPC.
- **UI-primitive consolidation** (LOW): segmented filter-pills (insights vs waitlist),
  `Metric` vs home's `Stat`, `ActionBtn` vs `Button` — three parallel implementations;
  extract `SegmentedControl` / shared `Metric` / a `danger` `Button` variant.
- **Loading-state inconsistency** (LOW): new screens show a spinner on first load; older
  `requests`/`clients` render blank. Bring the old ones to the spinner convention.
- **Badge not live pre-E3** (LOW): `invalidateBookingViews` excludes `/notifications`
  and there's no polling, so an inbound booking doesn't refresh the unread badge until
  the feed is opened. Acceptable as "push is the mechanism" (E3); flagged.
- **Pre-existing lint warnings** surfaced by the first-ever `expo lint` run: `clients.tsx`
  useMemo deps, mobile `bookings.ts` import/first. Both warnings, both pre-date this work.
- **Mustard-tint opacity drift** (`/15` vs `/20`) and a repeated `items-center py-16`
  spinner wrapper — minor token/markup cleanup.

## What was confirmed strong (checked, not rubber-stamped)

- **Security**: every new mutation is `requireMobileUser`-gated and RLS-scoped; **no
  cross-tenant write is possible** on books/waitlist/deposit; the deletion subject is
  always the token userId (no body id → no escalation); the retained record is money +
  Stripe ids only via an **allowlist** (a future PII column on `orders` can't leak).
- **TanStack adoption is correct, not cargo-culted**: stable `["api", path]` key, the
  Home bell badge + notifications feed share one cache, booking mutations invalidate
  all five views, `keepPrevious` applied exactly where it belongs (and deliberately not
  on calendar). Optimistic patches recompute derived counts (no desync).
- **Account-deletion core**: one shared `deleteOwnAccountCore` for all three callers
  (the admin path's old storage/Stripe-skipping bug can't re-propagate), paginated
  storage purge, verify-or-stop intent cancellation, pseudonymise relabel complete,
  first-review fixes all survived the counsel rework.
- **Shared types** consumed on both sides; **config.ts** eliminated the dual-API-base
  bug and is adopted everywhere; **deposit validation** (floor+cap+2-decimal+future
  date) is fully server-side.

## Founder follow-ups unchanged

DPIA (gates account-deletion launch), privacy-notice §10 clauses, Article 30 register,
ToS Art 28, the 0047 prerequisite (apply before any deletion path runs — the HIGH fix
now refuses rather than silently dropping records if it's missing, but the table must
exist for deletion-with-money to succeed at all).
