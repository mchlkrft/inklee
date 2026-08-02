import "server-only";
import * as Sentry from "@sentry/nextjs";
import { serviceClient } from "@/lib/supabase/service";
import {
  financialYearRetentionCutoff,
  daysAgoCutoff,
  monthsAgoCutoff,
} from "@/lib/server/retention-cutoffs";
import {
  countMatchingRows,
  deleteMatchingRows,
  updateMatchingRows,
  type RetentionMode,
  type RetentionStepResult,
} from "@/lib/server/retention-run";

/**
 * Guest-buyer retention purges (docs/legal/counsel-accountant-handoff-2026-08.md
 * PART 4, C1.4). This product has NO buyer accounts (see the FD5 note in
 * migration 0141): every guest checkout, cart and wishlist identifies the
 * buyer by email-on-the-order or a hashed cookie token, never a persistent
 * account, so there is no account-deletion flow that ever touches this data.
 * These four functions are the ENTIRE lawful-retention story for it, per
 * counsel's table:
 *
 *   Completed order   -> retain 7 years from the END of the financial year
 *                         (Art. 6(1)(c)/17(3)(b); Estonian Accounting Act
 *                         § 12); the guest email stays on the order as part
 *                         of the financial record until then.
 *   Cancelled order    -> no financial-record basis once cancelled.
 *                         Pseudonymise the guest email 30 days after
 *                         cancellation (the 30-day window is an operational
 *                         allowance for disputes about the cancellation
 *                         itself); the de-identified row is kept for
 *                         statistics. See PURGED_EMAIL_PLACEHOLDER below for
 *                         why this is pseudonymise-with-a-constant rather
 *                         than a literal NULL.
 *   Abandoned cart      -> delete entirely 30 days after last activity.
 *   Guest wishlist item -> delete after 12 months of inactivity.
 *
 * Every function is scoped to STANDALONE orders/carts/wishlists only
 * (orders: booking_id IS NULL). A booking-linked order's client_email
 * mirrors the booking's own customer_email and follows the booking's own
 * retention story, not this one — these functions must never touch a
 * booking-linked row.
 *
 * Each function takes an explicit `now` (default `new Date()`) so tests can
 * pin exact boundary instants without faking the system clock, and an
 * explicit `mode` (default `"purge"`): in `"dry-run"` every function reports
 * the number of rows its rule MATCHES and writes nothing, which is counsel's
 * Q14 element (2). Both branches of every function are built from one shared
 * predicate (`retention-run.ts`), so the reported number cannot drift from
 * what a real run would touch.
 */

export type PurgeResult = { count: number };

/**
 * PSEUDONYMISE, not NULL — this is not a style choice, it is forced by
 * `orders_buyer_identity_check` (migration 0134): `booking_id IS NOT NULL OR
 * client_email IS NOT NULL`, added so an order always has someone to fulfil
 * to. A standalone order (the ONLY kind these purges ever touch) has
 * `booking_id IS NULL` by definition, so setting `client_email` to NULL on
 * one is not merely undesirable, it is a constraint violation the database
 * itself refuses — discovered empirically: the first version of this file
 * used `client_email: null` and every purge call against a real fixture
 * failed with `new row for relation "orders" violates check constraint
 * "orders_buyer_identity_check"` (tests/db/shop-retention-purge.test.ts).
 * A single constant, non-identifying placeholder shared by every purged row
 * satisfies the NOT NULL side of the constraint while carrying zero
 * personal data — no per-row reversible link is kept, so this is
 * effectively erasure with a schema-satisfying tombstone value rather than a
 * true (reversible) pseudonym, which is what counsel's "erase or
 * pseudonymise" already offered as the choice.
 */
export const PURGED_EMAIL_PLACEHOLDER = "purged@retention.inklee.invalid";

/**
 * Cancelled order (counsel's flagged gap — "no current path and no lawful
 * anchor without it"). Pseudonymises `client_email` on standalone orders
 * that have sat cancelled for 30+ days. The row itself survives for
 * statistics; only the PII is removed. `.neq` (not `.not(...,"is",null)`)
 * against the placeholder makes repeat runs idempotent: an already-purged
 * row never matches and is never re-counted.
 *
 * ANCHORED ON `cancelled_at`, NOT `updated_at` (counsel deviation D4,
 * migration 0149). `updated_at` is written by every writer of the row, so a
 * refund flip, an admin correction or any future column added to the order
 * restarted the 30-day clock and the guest's email quietly outlived the
 * period counsel set. `cancelled_at` is stamped by
 * `orders_stamp_cancelled_at_trg` at the moment the status becomes
 * `cancelled` and is not touched again while it stays cancelled, so the
 * clock runs from the EVENT. Counsel: "a clock any later touch can restart
 * is not the specified rule and will drift silently."
 */
export async function purgeCancelledStandaloneOrderEmails(
  now: Date = new Date(),
  mode: RetentionMode = "purge",
): Promise<PurgeResult> {
  const cutoff = daysAgoCutoff(now, 30).toISOString();
  const count = await updateMatchingRows(
    mode,
    "orders",
    "id",
    { client_email: PURGED_EMAIL_PLACEHOLDER },
    (q) =>
      q
        .is("booking_id", null)
        .eq("status", "cancelled")
        .neq("client_email", PURGED_EMAIL_PLACEHOLDER)
        .lt("cancelled_at", cutoff),
  );
  return { count };
}

/**
 * The failure mode the D4 fix introduces, made visible instead of silent.
 *
 * Keying the purge to `cancelled_at` means a cancelled standalone order with
 * a NULL `cancelled_at` never matches `< cutoff` and is therefore never
 * purged, forever, without erroring — over-retention that looks exactly like
 * "there was nothing to purge". 0149's trigger plus its backfill should make
 * that set permanently empty; this counts it every run so that if a future
 * writer ever bypasses the trigger (a raw SQL migration, a restore from a
 * dump taken before 0149) it shows up as a number and an alert rather than
 * as compliant-looking silence.
 *
 * NOT a purge: it never writes in either mode. It is reported alongside the
 * purge steps because the cron response and the run log are where anyone
 * looks for the health of this control.
 */
export async function countUnstampedCancelledStandaloneOrders(): Promise<PurgeResult> {
  const count = await countMatchingRows("orders", "id", (q) =>
    q
      .is("booking_id", null)
      .eq("status", "cancelled")
      .neq("client_email", PURGED_EMAIL_PLACEHOLDER)
      .is("cancelled_at", null),
  );
  if (count > 0) {
    Sentry.captureMessage(
      `Retention: ${count} cancelled standalone order(s) have no cancelled_at and can never be purged`,
      {
        level: "error",
        tags: { action: "shop_retention_purge", step: "unstamped_cancelled" },
      },
    );
  }
  return { count };
}

/**
 * Completed order, 7 years from the end of the financial year. Anchored on
 * `created_at`: a standalone checkout pays within minutes of creation (the
 * PaymentIntent is confirmed on the same page load), so `created_at` and the
 * transaction date are effectively the same financial year, and unlike
 * `updated_at` it is never disturbed by a later partial refund or refund
 * flip — using it can only ever OVER-retain relative to the true payment
 * date, never under-retain (the same safety direction the pre-existing
 * `deleted_account_records` purge documents for itself). Same placeholder,
 * same constraint, same reasoning as the cancelled-order purge above.
 */
export async function purgeCompletedStandaloneOrderEmails(
  now: Date = new Date(),
  mode: RetentionMode = "purge",
): Promise<PurgeResult> {
  const cutoff = financialYearRetentionCutoff(now, 7).toISOString();
  const count = await updateMatchingRows(
    mode,
    "orders",
    "id",
    { client_email: PURGED_EMAIL_PLACEHOLDER },
    (q) =>
      q
        .is("booking_id", null)
        .in("status", ["paid", "refunded", "partially_refunded"])
        .neq("client_email", PURGED_EMAIL_PLACEHOLDER)
        .lt("created_at", cutoff),
  );
  return { count };
}

/**
 * Abandoned cart: delete 30 days after LAST ACTIVITY. A cart's own
 * `updated_at` is only set at creation (add/update/remove touch
 * `shop_cart_items.updated_at`, never the parent cart row — see
 * shop-cart.ts), so "last activity" for a cart is the more recent of its own
 * `updated_at` and its items' `updated_at`. Two round trips rather than a
 * single joined query: the supabase-js client has no subquery filter, and a
 * cart with zero items (abandoned before a single add landed, or already
 * emptied by removals) must still purge off its own `updated_at` alone.
 */
export async function purgeAbandonedCarts(
  now: Date = new Date(),
  mode: RetentionMode = "purge",
): Promise<PurgeResult> {
  const cutoffIso = daysAgoCutoff(now, 30).toISOString();

  const { data: activeItemRows, error: activeError } = await serviceClient
    .from("shop_cart_items")
    .select("cart_id")
    .gte("updated_at", cutoffIso);
  if (activeError) throw activeError;
  const activeCartIds = new Set(
    (activeItemRows ?? []).map((r) => r.cart_id as string),
  );

  const { data: staleCandidates, error: candidateError } = await serviceClient
    .from("shop_carts")
    .select("id")
    .lt("updated_at", cutoffIso);
  if (candidateError) throw candidateError;

  const idsToDelete = (staleCandidates ?? [])
    .map((r) => r.id as string)
    .filter((id) => !activeCartIds.has(id));
  // The dry-run stops here rather than reusing `deleteMatchingRows`: the
  // candidate set IS the answer, and it was computed by the same two reads a
  // real run performs. Counting via a third query would be a second copy of
  // the rule, which is the drift this design exists to prevent.
  if (mode === "dry-run") return { count: idsToDelete.length };
  if (idsToDelete.length === 0) return { count: 0 };

  // shop_cart_items.cart_fk is ON DELETE CASCADE (0141): deleting the cart
  // removes its items in the same statement, no separate item delete needed.
  const { data: deleted, error: deleteError } = await serviceClient
    .from("shop_carts")
    .delete()
    .in("id", idsToDelete)
    .select("id");
  if (deleteError) throw deleteError;
  return { count: deleted?.length ?? 0 };
}

/**
 * Guest wishlist item: delete after 12 months of inactivity. A wishlist row
 * has no update path at all (add creates a row, remove deletes it — there is
 * no quantity or any other mutable field), so `created_at` IS the last
 * activity for that row; no join against another table is needed the way
 * carts require.
 */
export async function purgeInactiveWishlistItems(
  now: Date = new Date(),
  mode: RetentionMode = "purge",
): Promise<PurgeResult> {
  const cutoff = monthsAgoCutoff(now, 12).toISOString();
  const count = await deleteMatchingRows(
    mode,
    "shop_wishlist_items",
    "id",
    (q) => q.lt("created_at", cutoff),
  );
  return { count };
}

/**
 * Runs all four steps independently: one step's failure must never prevent
 * the others from running (see the retention-purge cron's own doc comment
 * for why this matters — an early sequential 500 used to strand every step
 * after it with no retry). Every failure is captured to Sentry AND reported
 * back to the caller so the cron route can decide the HTTP status without
 * re-deriving what happened.
 */
export type ShopRetentionStepResult = RetentionStepResult;

export async function runShopRetentionPurges(
  now: Date = new Date(),
  mode: RetentionMode = "purge",
): Promise<Record<string, ShopRetentionStepResult>> {
  const steps: [string, () => Promise<PurgeResult>][] = [
    [
      "purged_cancelled_standalone_order_emails",
      () => purgeCancelledStandaloneOrderEmails(now, mode),
    ],
    [
      "purged_completed_standalone_order_emails",
      () => purgeCompletedStandaloneOrderEmails(now, mode),
    ],
    ["purged_abandoned_carts", () => purgeAbandonedCarts(now, mode)],
    [
      "purged_inactive_wishlist_items",
      () => purgeInactiveWishlistItems(now, mode),
    ],
    // Health check, not a purge — see the function's own comment. Runs in
    // BOTH modes because it never writes.
    [
      "unstamped_cancelled_standalone_orders",
      () => countUnstampedCancelledStandaloneOrders(),
    ],
  ];

  const results: Record<string, ShopRetentionStepResult> = {};
  for (const [name, fn] of steps) {
    try {
      const { count } = await fn();
      results[name] = { ok: true, count };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results[name] = { ok: false, error: message };
      Sentry.captureException(err, {
        tags: { action: "shop_retention_purge", step: name },
      });
    }
  }
  return results;
}
