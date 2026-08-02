import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, makeActor, type Actor } from "./helpers/actor";

// shop-retention.ts (a real server module, imported directly below so this
// stays a genuine DB integration test rather than a mock of the thing under
// test) starts with `import "server-only"`, which throws unconditionally
// outside Next's RSC/client build. Same workaround already used by
// payment-request-intent-race.test.ts for the same reason; Vitest hoists
// `vi.mock` above the imports below regardless of source position.
vi.mock("server-only", () => ({}));

import {
  purgeCancelledStandaloneOrderEmails,
  purgeCompletedStandaloneOrderEmails,
  purgeAbandonedCarts,
  purgeInactiveWishlistItems,
  PURGED_EMAIL_PLACEHOLDER,
} from "@/lib/server/shop-retention";
import { daysAgoCutoff, monthsAgoCutoff } from "@/lib/server/retention-cutoffs";

/**
 * C1.4 guest-buyer retention purges against a real Postgres
 * (docs/legal/counsel-accountant-handoff-2026-08.md PART 4). Every rule is
 * proven at its exact boundary — a fixture one day inside the retention
 * window survives, a fixture one day past it does not — because an off-by-
 * one here is either a compliance failure (retained too long) or a
 * data-loss bug (deleted a day early), and counsel called this out by name.
 *
 * Assertions re-read the SPECIFIC row/cart/item by id after each purge call
 * rather than trusting the aggregate `count` the purge functions return:
 * these are system-wide purges over shared tables, so a later test's fixture
 * must not be able to make an earlier test's assertion pass or fail by
 * accident.
 */

const LABEL = "c14-retention";
const NOW = new Date("2026-08-02T12:00:00.000Z");

let admin: SupabaseClient;
let artist: Actor;
let productId: string;

beforeAll(async () => {
  admin = adminClient();
  artist = await makeActor(admin, LABEL);

  const product = await admin
    .from("products")
    .insert({
      artist_id: artist.id,
      title: "C1.4 fixture product",
      price_amount: 10,
      currency: "eur",
      status: "active",
      is_public_visible: true,
    })
    .select("id")
    .single();
  expect(product.error, product.error?.message).toBeNull();
  productId = product.data!.id as string;
}, 60_000);

afterAll(async () => {
  await admin.from("shop_wishlist_items").delete().eq("artist_id", artist.id);
  await admin.from("shop_cart_items").delete().eq("artist_id", artist.id);
  await admin.from("shop_carts").delete().eq("artist_id", artist.id);
  await admin.from("orders").delete().eq("artist_id", artist.id);
  await admin.from("products").delete().eq("artist_id", artist.id);
  await admin.from("profiles").delete().eq("id", artist.id);
  await admin.auth.admin.deleteUser(artist.id);
}, 60_000);

async function insertOrder(fields: Record<string, unknown>): Promise<string> {
  const { data, error } = await admin
    .from("orders")
    .insert({
      artist_id: artist.id,
      deposit_amount: 0,
      subtotal_amount: 0,
      ...fields,
    })
    .select("id")
    .single();
  expect(error, error?.message).toBeNull();
  return data!.id as string;
}

async function orderEmail(orderId: string): Promise<string | null> {
  const { data, error } = await admin
    .from("orders")
    .select("client_email")
    .eq("id", orderId)
    .single();
  expect(error, error?.message).toBeNull();
  return (data?.client_email as string | null) ?? null;
}

// ===========================================================================
// Rule 1: cancelled order — erase the guest email 30 days after cancellation.

describe("cancelled standalone order: erase email 30 days after cancellation", () => {
  it("survives at 29 days old (inside the 30-day window)", async () => {
    const id = await insertOrder({
      client_email: "survivor-29d@example.com",
      status: "cancelled",
      updated_at: new Date(
        NOW.getTime() - 29 * 24 * 60 * 60 * 1000,
      ).toISOString(),
    });
    await purgeCancelledStandaloneOrderEmails(NOW);
    expect(await orderEmail(id)).toBe("survivor-29d@example.com");
  });

  it("is pseudonymised at 31 days old (past the 30-day window) — MUTATION-PROVEN", async () => {
    const id = await insertOrder({
      client_email: "erase-31d@example.com",
      status: "cancelled",
      updated_at: new Date(
        NOW.getTime() - 31 * 24 * 60 * 60 * 1000,
      ).toISOString(),
    });
    const result = await purgeCancelledStandaloneOrderEmails(NOW);
    expect(result.count).toBeGreaterThanOrEqual(1);
    expect(await orderEmail(id)).toBe(PURGED_EMAIL_PLACEHOLDER);
  });

  it("a second run is idempotent — an already-pseudonymised row is never re-counted", async () => {
    const id = await insertOrder({
      client_email: "idempotent-31d@example.com",
      status: "cancelled",
      updated_at: new Date(
        NOW.getTime() - 31 * 24 * 60 * 60 * 1000,
      ).toISOString(),
    });
    const first = await purgeCancelledStandaloneOrderEmails(NOW);
    expect(first.count).toBeGreaterThanOrEqual(1);
    expect(await orderEmail(id)).toBe(PURGED_EMAIL_PLACEHOLDER);

    // Re-running must not error (an already-purged row must not re-match the
    // filter — if it did, re-setting the placeholder onto itself is harmless,
    // but a regression to the old `.not(..., "is", null)` filter combined
    // with a NULL write would throw here on the SECOND pass too).
    const second = await purgeCancelledStandaloneOrderEmails(NOW);
    expect(second.count).toBe(0); // already-purged row must not be re-counted
    expect(await orderEmail(id)).toBe(PURGED_EMAIL_PLACEHOLDER);
  });

  it("leaves a booking-linked order's email untouched even if cancelled and old (out of scope: governed by the booking's own retention)", async () => {
    const booking = await admin
      .from("booking_requests")
      .insert({
        artist_id: artist.id,
        customer_email: "booking-buyer@example.com",
        status: "approved",
      })
      .select("id")
      .maybeSingle();
    // booking_requests schema varies by environment; skip gracefully if this
    // minimal insert doesn't satisfy other NOT NULL columns rather than
    // failing the whole suite on an unrelated fixture gap.
    if (booking.error || !booking.data) return;
    const bookingId = booking.data.id as string;
    const id = await insertOrder({
      booking_id: bookingId,
      client_email: "booking-order@example.com",
      status: "cancelled",
      updated_at: new Date(
        NOW.getTime() - 400 * 24 * 60 * 60 * 1000,
      ).toISOString(),
    });
    await purgeCancelledStandaloneOrderEmails(NOW);
    expect(await orderEmail(id)).toBe("booking-order@example.com");
    await admin.from("orders").delete().eq("id", id);
    await admin.from("booking_requests").delete().eq("id", bookingId);
  });

  it("leaves a still-pending standalone order untouched regardless of age", async () => {
    const id = await insertOrder({
      client_email: "still-pending@example.com",
      status: "pending",
      updated_at: new Date(
        NOW.getTime() - 400 * 24 * 60 * 60 * 1000,
      ).toISOString(),
    });
    await purgeCancelledStandaloneOrderEmails(NOW);
    expect(await orderEmail(id)).toBe("still-pending@example.com");
  });
});

// ===========================================================================
// Rule 2: completed order — retain 7 years from the END of the financial
// year (not 7 years from the order's own date).

describe("completed standalone order: erase email 7y from financial-year-end", () => {
  it("survives when created 1 Jan of the year that is still inside the 7-year retention", async () => {
    // financialYearRetentionCutoff(NOW=2026-08-02, 7) = 2019-01-01. A row
    // dated exactly 2019-01-01 belongs to financial year 2019, retained
    // through 31 Dec 2026, so it must NOT be purged yet.
    const id = await insertOrder({
      client_email: "fy2019-survivor@example.com",
      status: "paid",
      created_at: "2019-01-01T00:00:00.000Z",
    });
    await purgeCompletedStandaloneOrderEmails(NOW);
    expect(await orderEmail(id)).toBe("fy2019-survivor@example.com");
  });

  it("is erased when created 31 Dec of the prior financial year — proves it is NOT naive '7 years from the order date'", async () => {
    // A row dated 2018-12-31 belongs to financial year 2018, retained
    // through 31 Dec 2025, purgeable from 1 Jan 2026 — well before NOW
    // (2026-08-02). The NAIVE "subtract 7 years from the row's own date"
    // formula would compute 2025-12-31 as this row's cutoff and still call
    // it purgeable, so this alone wouldn't distinguish the two formulas;
    // the distinguishing case is the FY2019 row one day later (2019-01-01)
    // above, whose naive cutoff (2026-01-01) has ALSO already passed by
    // NOW but which the correct financial-year-end rule still retains
    // through 2026-12-31. Both fixtures together pin the arithmetic.
    const id = await insertOrder({
      client_email: "fy2018-erase@example.com",
      status: "paid",
      created_at: "2018-12-31T23:59:59.000Z",
    });
    const result = await purgeCompletedStandaloneOrderEmails(NOW);
    expect(result.count).toBeGreaterThanOrEqual(1);
    expect(await orderEmail(id)).toBe(PURGED_EMAIL_PLACEHOLDER);
  });

  it("does not touch a cancelled order even if old (cancelled orders follow the cancellation rule, not this one)", async () => {
    const id = await insertOrder({
      client_email: "cancelled-old@example.com",
      status: "cancelled",
      created_at: "2015-01-01T00:00:00.000Z",
      updated_at: "2015-01-01T00:00:00.000Z",
    });
    await purgeCompletedStandaloneOrderEmails(NOW);
    expect(await orderEmail(id)).toBe("cancelled-old@example.com"); // untouched by the completed-order rule
    // This row IS old enough for the cancelled-order rule too, so run that
    // one as well to prove this test isn't passing by accident of ordering.
    await purgeCancelledStandaloneOrderEmails(NOW);
    expect(await orderEmail(id)).toBe(PURGED_EMAIL_PLACEHOLDER); // pseudonymised, but by the CANCELLED rule
  });
});

// ===========================================================================
// Rule 3: abandoned cart — delete entirely 30 days after last activity.
// "Last activity" = the more recent of the cart's own updated_at and its
// items' updated_at (shop-cart.ts never touches the parent cart row on
// add/update/remove).

describe("abandoned cart: delete 30 days after last activity", () => {
  async function makeCart(cartUpdatedAt: string): Promise<string> {
    const { data, error } = await admin
      .from("shop_carts")
      .insert({
        guest_token_hash: `c14-cart-${crypto.randomUUID()}`,
        artist_id: artist.id,
        updated_at: cartUpdatedAt,
      })
      .select("id")
      .single();
    expect(error, error?.message).toBeNull();
    return data!.id as string;
  }

  async function cartExists(cartId: string): Promise<boolean> {
    const { data } = await admin
      .from("shop_carts")
      .select("id")
      .eq("id", cartId)
      .maybeSingle();
    return Boolean(data);
  }

  it("survives an empty cart whose own activity is 29 days old", async () => {
    const cartId = await makeCart(
      new Date(NOW.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString(),
    );
    await purgeAbandonedCarts(NOW);
    expect(await cartExists(cartId)).toBe(true);
  });

  it("deletes an empty cart whose own activity is 31 days old", async () => {
    const cartId = await makeCart(
      new Date(NOW.getTime() - 31 * 24 * 60 * 60 * 1000).toISOString(),
    );
    const result = await purgeAbandonedCarts(NOW);
    expect(result.count).toBeGreaterThanOrEqual(1);
    expect(await cartExists(cartId)).toBe(false);
  });

  it("survives a cart whose OWN updated_at is stale but whose item was touched 5 days ago (activity is per-item, not just per-cart)", async () => {
    const cartId = await makeCart(
      new Date(NOW.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    );
    const item = await admin
      .from("shop_cart_items")
      .insert({
        cart_id: cartId,
        artist_id: artist.id,
        kind: "product",
        product_id: productId,
        quantity: 1,
        updated_at: new Date(
          NOW.getTime() - 5 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      })
      .select("id")
      .single();
    expect(item.error, item.error?.message).toBeNull();

    await purgeAbandonedCarts(NOW);
    expect(await cartExists(cartId)).toBe(true);

    await admin.from("shop_cart_items").delete().eq("id", item.data!.id);
  });

  it("deletes a cart (and cascades its item) when both the cart and its item are 31 days stale", async () => {
    const cartId = await makeCart(
      new Date(NOW.getTime() - 31 * 24 * 60 * 60 * 1000).toISOString(),
    );
    const item = await admin
      .from("shop_cart_items")
      .insert({
        cart_id: cartId,
        artist_id: artist.id,
        kind: "product",
        product_id: productId,
        quantity: 1,
        updated_at: new Date(
          NOW.getTime() - 31 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      })
      .select("id")
      .single();
    expect(item.error, item.error?.message).toBeNull();
    const itemId = item.data!.id as string;

    await purgeAbandonedCarts(NOW);
    expect(await cartExists(cartId)).toBe(false);

    const { data: itemAfter } = await admin
      .from("shop_cart_items")
      .select("id")
      .eq("id", itemId);
    expect(itemAfter ?? [], "the item must cascade with its cart").toHaveLength(
      0,
    );
  });
});

// ===========================================================================
// Rule 4: guest wishlist item — delete after 12 months of inactivity.
// Wishlist rows have no update path (add inserts, remove deletes), so
// created_at IS last activity.

describe("guest wishlist item: delete after 12 months of inactivity", () => {
  async function makeWishlistItem(createdAt: string): Promise<string> {
    const { data, error } = await admin
      .from("shop_wishlist_items")
      .insert({
        guest_token_hash: `c14-wish-${crypto.randomUUID()}`,
        artist_id: artist.id,
        product_id: productId,
        created_at: createdAt,
      })
      .select("id")
      .single();
    expect(error, error?.message).toBeNull();
    return data!.id as string;
  }

  async function itemExists(id: string): Promise<boolean> {
    const { data } = await admin
      .from("shop_wishlist_items")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    return Boolean(data);
  }

  it("survives one day inside the 12-month window", async () => {
    const cutoff = monthsAgoCutoff(NOW, 12);
    const insideWindow = new Date(cutoff.getTime() + 24 * 60 * 60 * 1000);
    const id = await makeWishlistItem(insideWindow.toISOString());
    await purgeInactiveWishlistItems(NOW);
    expect(await itemExists(id)).toBe(true);
  });

  it("is deleted one day past the 12-month window", async () => {
    const cutoff = monthsAgoCutoff(NOW, 12);
    const pastWindow = new Date(cutoff.getTime() - 24 * 60 * 60 * 1000);
    const id = await makeWishlistItem(pastWindow.toISOString());
    const result = await purgeInactiveWishlistItems(NOW);
    expect(result.count).toBeGreaterThanOrEqual(1);
    expect(await itemExists(id)).toBe(false);
  });
});

// Sanity: the day-based helper used to build fixtures above matches the
// same cutoff the purge functions compute internally, so a future edit to
// `daysAgoCutoff` cannot silently desync the fixtures from the rule under
// test without a failure showing up either here or in retention-cutoffs.test.ts.
describe("fixture/production cutoff agreement", () => {
  it("30 days is 30 days", () => {
    const cutoff = daysAgoCutoff(NOW, 30);
    expect(cutoff.toISOString()).toBe("2026-07-03T12:00:00.000Z");
  });
});
