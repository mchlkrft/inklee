# Deposits redesign: chase overview + settings split (web + app)

Status: in progress. Branch `feat/dashboard-redesign` (continues the dashboard work).
Decision locked with founder 2026-06-15: **Option A, build the chase overview (parity).**

## Why

A 3-lens UX audit (workflow `w6ipasgak`) found the deposits surface has an IA
collision plus clutter:

- **Web `/bookings/deposits` is a settings/defaults page**, not an overview. It
  jams three concerns onto one page (request defaults / client-facing
  cancellation+refund policy / Stripe Connect status) wrapped in heavy legal
  prose, with two ambiguous independent Save buttons.
- **Mobile `bookings/deposits` is a read-only chase list** (Outstanding /
  Collected). Same route name, opposite meaning. Web has no chase list at all.
- The redesigned dashboard "Deposits due (N overdue)" box links to
  `/bookings/deposits`, so on web it lands on a config form instead of the list
  of due deposits. **False promise introduced by the dashboard redesign.**
- Mobile "Collected" does not reconcile: the Collected *tile* counts paid only,
  the Collected *section* lists paid AND refunded, so rows under the heading
  don't add up to the number above.

Best-practice verdict for a solo operator: this is a "who do I chase" view, not
a ledger. The one number is **Outstanding** (with **Overdue** broken out and
louder); Collected is reassurance and should be demoted; group by state,
outstanding-first; relative dates on actionable rows; keep money-state mutations
(request / mark received / refund) on the booking detail. No "send reminder"
mechanism exists today, so that stays out of scope.

## Target IA

| Route | Before | After |
|---|---|---|
| `/bookings/deposits` (web) | settings (defaults + policy + Stripe status) | **chase overview** (Outstanding / Collected list) |
| `/settings/deposits` (web) | redirect -> `/bookings/deposits` | **deposit settings** (defaults + cancellation/refund policy) |
| Stripe Connect status | duplicated on the deposits page | only on `/settings/payouts` (already canonical there); deposits settings keeps a one-line pointer |
| mobile `bookings/deposits` | chase list (cluttered) | **chase overview** (same structure as web) |
| mobile Settings > Deposit defaults / Cancellation & refunds | two screens | unchanged; overview gains a footer link to them |

## One source of truth

New shared builder `apps/web/src/lib/server/deposits.ts` -> `getDepositsOverview`
(mirrors the `getDashboardData` precedent: computes `now = Date.now()`
internally so server-component callers stay pure per the React Compiler lint).
Consumed by BOTH the new web overview page AND the mobile API route
(`api/mobile/bookings/deposits/route.ts` becomes a thin wrapper). Classification
stays on the single `depositState` classifier + the `deposit_refunded` audit
lookup.

New shared helper `relativeDueLabel(dueAt, now)` in `packages/shared/src/format.ts`
(Intl-free, `now` injected): "due in 3 days" / "due tomorrow" / "due today" /
"5 days overdue". Called only inside the builder (server) so the relative,
now-dependent label is single-sourced and identical on both surfaces. Settled
rows' absolute dates ("Paid 12 Jun") stay formatted client-side per platform
(web `formatDate` / mobile Intl-free `formatShortDate`).

### Builder output additions

- `summary.overdueCount`, `summary.overdueAmount` (break Overdue out of Outstanding).
- each item gains `dueLabel: string | null` (relative, set for awaiting/overdue).

## Overview layout (web + app, identical structure)

Hero card:
```
OUTSTANDING
EUR 450
2 overdue - EUR 200        <- danger, only when overdue > 0
Collected EUR 1,200        <- muted secondary line, NOT a co-equal tile
```

Sections (each shows a count, rendered only when non-empty):
- **Overdue {n}** (danger header) - overdue rows
- **Awaiting {n}** - awaiting rows
- **Collected {n}** - paid rows
- **Refunded {n}** - refunded rows   <- own section fixes the reconciliation bug

Rows (decluttered): client (left) + amount (right, drop `.00` on whole amounts)
+ a single colored when-label below the client:
- overdue / awaiting -> `dueLabel` (or "No due date" when null)
- paid -> "Paid {date}"
- refunded -> "Returned to client"
Drop the per-row state pill (the section header names the state) and drop the
`- Card / - Manual` suffix from the scan line (method lives on the detail).
Overdue rows get a subtle danger tint / left accent for peripheral scanning.
Rows tap through to the booking detail (web `/bookings/requests/{id}`, mobile
`/bookings/{id}`) where the real actions live.

States:
- No deposits at all -> "No deposits yet" empty state (unchanged copy).
- Items exist but nothing outstanding -> positive "Nothing to chase. You're all
  caught up." in place of an EUR 0 hero, with Collected/Refunded below.

## Copy rules

No em-dashes; sentence case; terminal punctuation on full sentences only. Verbs
stay Accept / Pass elsewhere; this surface is read-only.

## Build order

1. shared: `relativeDueLabel` + extend `MobileDepositsResponse` types.
2. web: `getDepositsOverview` builder; rewrite `/bookings/deposits` as overview;
   point mobile route at the builder.
3. web: move defaults + policy forms to `/settings/deposits` (un-redirect it);
   drop `DepositCollectionStatus`, add the Payouts pointer; update nav (add
   Deposits under Settings) + revalidatePath targets.
4. mobile: rewrite the overview screen to the new structure + footer settings link.
5. dashboard box: now honest on web (links to the real overview).
6. lint + typecheck both apps; self-review the money/state edges.

## Adversarial review (2026-06-15, workflow w3cao5wg6)

4-dimension review (logic / link-integrity / parity / copy-ux), each finding
double-verified. No blockers. Fixes applied before commit:

- **Money parity:** web used Intl, mobile used a symbol-prefix formatter, so the
  same amount rendered differently across surfaces (one-source-of-truth
  violation). Replaced both with a single Intl-free `formatMoneyShort` in
  `packages/shared/src/money.ts` (deterministic en-style: comma thousands, dot
  decimal, `.00` dropped). Mobile `bookings.ts` re-exports it and sources its
  `CURRENCY_SYMBOLS` from there too. This also removed the web `undefined`-locale
  nondeterminism.
- **Mobile config card over-promised:** one card named the refund policy but
  routed only to `/settings/deposit-defaults`. Split into two pointers
  (defaults + cancellation/refunds) matching the two mobile settings screens.
- **Mixed-currency rollups:** real but pre-existing pattern (one Stripe payout
  currency per artist is the effective invariant); documented the assumption in
  the builder next to the `sum()`.
- Apostrophe-style nit: pre-existing, not a copy-rule violation, left as-is.
