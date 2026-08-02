# Records of processing — guest shop orders, carts and wishlists

Status: drafted by the implementation worker per counsel's C1.4 answer
(`docs/legal/counsel-accountant-handoff-2026-08.md`, PART 4, "RoP" line under
C1.4). This is the first Article 30 register entry committed as a standalone
document; earlier processing activities (account data, bookings, Connect
payouts) are described in prose across `docs/account-deletion-handoff.md` and
`docs/legal/counsel-decision-pack.md` rather than as a register entry, and
have not been consolidated here. This file covers ONLY the activity C1.4
asked about: a buyer with no Inklee account checking out of an artist's
standalone shop, plus the pre-checkout cart and wishlist.

## Processing activity: guest goods checkout (standalone shop, GC1/FD5)

**Controller:** Inklee (platform), acting as processor for the artist's sale
contract and as controller for its own hosting/payment-processing role — see
the C1.1 disclosure block ("Inklee hosts this shop and processes the payment
on the artist's behalf. Your purchase contract is with the artist.").

**Purpose:** enabling a purchase from an artist's shop by someone who has no
Inklee account, sending the buyer a receipt, and letting the artist arrange
pickup or delivery.

**Categories of data subjects:** guest buyers (no account exists for this
role in the product — verified in the FD5 decision log: `signUp` only ever
creates an artist profile).

**Categories of personal data:**
- Email address (`orders.client_email`), collected at checkout.
- Order contents: product/bundle/variant, quantity, price paid
  (`order_items`, `orders`).
- Cart token hash (`shop_carts.guest_token_hash`,
  `shop_wishlist_items.guest_token_hash`): a SHA-256 hash of a random cookie
  token generated client-side; the raw token itself is never stored
  server-side and is not personal data of a form Inklee can reverse to an
  identity on its own.
- No name, no postal/delivery address, no payment card data (payment details
  stay with Stripe; delivery/pickup arrangements happen directly between
  buyer and artist, off-platform).

**Recipients:** the artist (seller of record for the order), and Stripe
(payment processor; see the existing Stripe DPA/SCCs/DPF transfer mechanism
recorded for the platform generally in `docs/account-deletion-handoff.md`
§7).

**Legal bases:**
- Art. 6(1)(b) (performance of a contract): collecting the email and order
  contents to fulfil the purchase and send the receipt; the cart/wishlist
  token hash to let the buyer resume a shopping session.
- Art. 6(1)(c) (compliance with a legal obligation): retaining the completed
  order as a financial record under Estonian Accounting Act § 12.

**Retention (the table counsel specified):**

| Case | Rule |
|---|---|
| Completed order | Retain 7 years from the end of the financial year (Art. 6(1)(c)/17(3)(b); Accounting Act § 12). The guest email stays on the order as part of the financial record until then. |
| Cancelled order | No financial-record basis. Pseudonymise the guest email 30 days after cancellation (a constant, non-identifying placeholder — the schema's own `orders_buyer_identity_check`, migration 0134, refuses a literal NULL on a booking-less order); the de-identified row is kept for statistics. The 30 days run from `orders.cancelled_at`, the instant the order entered the cancelled state (counsel D4, migration 0149), not from any later touch of the row. |
| Abandoned cart | Delete entirely 30 days after last activity. |
| Guest wishlist item | Keep while active; delete after 12 months of inactivity. |

**Implementation:** `apps/web/src/lib/server/shop-retention.ts`
(`purgeCancelledStandaloneOrderEmails`,
`purgeCompletedStandaloneOrderEmails`, `purgeAbandonedCarts`,
`purgeInactiveWishlistItems`), run by the existing
`apps/web/src/app/api/cron/retention-purge/route.ts` cron. Cutoff arithmetic
lives in `apps/web/src/lib/server/retention-cutoffs.ts` and is unit-tested;
each purge rule is DB-tested at its boundary in
`apps/web/tests/db/shop-retention-purge.test.ts`.

**Purge cadence:** weekly (`vercel.json`, `0 5 * * 1`), raised from monthly on
2026-08-03 for counsel deviation D3. A monthly cron made every 30-day rule
above deliver up to roughly 60 days in practice; counsel's cure was to raise
the cadence rather than restate the period as 60 days, so the periods in this
table are the periods that are actually delivered, within the one-week purge
interval. Execution evidence (per-run, per-block matched-row counts, including
runs that matched nothing) is written to `retention_purge_runs`; operating
procedure in `docs/retention-purge-operations.md`.

**Technical/organizational measures:** `shop_carts`, `shop_cart_items`,
`shop_wishlist_items` carry RLS with zero grants to `anon`/`authenticated`
(migration 0141) — the only writer of any of these tables is the
service-role client behind a `"use server"` action that checks the caller's
httpOnly cookie token hash in application code. Orders are read under RLS
scoped to the owning artist.

**Transfers outside the EU/EEA:** none introduced by this activity beyond the
platform's existing Stripe processing relationship (recorded generally in
`docs/account-deletion-handoff.md` §7).
