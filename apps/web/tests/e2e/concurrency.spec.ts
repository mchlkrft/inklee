import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { artistA } from "./helpers/auth";
import { admin, createTestFlashItem } from "./helpers/seed";

/**
 * DB-level concurrency guarantees for the two hardening fixes (PUB-3, PAY-1).
 * These call the RPCs directly (no browser) so the race is exercised as tightly
 * as possible; a regression that drops the row lock or the atomic increment
 * fails here even though the UI would look fine.
 */
test.describe("concurrency: flash capacity + sponsorship counter", () => {
  test("book_flash_item lets only one booking through a unique design", async () => {
    const itemId = await createTestFlashItem(artistA().id, {
      bookingMode: "unique",
    });

    // Fire 8 bookings at once. Exactly one must win.
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        admin().rpc("book_flash_item", {
          p_flash_item_id: itemId,
          p_artist_id: artistA().id,
          p_booking_id: randomUUID(),
          p_form_data: { placement: "arm" },
          p_preferred_date: null,
          p_customer_email: null,
          p_customer_handle: null,
          p_customer_token_hash: null,
          p_flash_day_id: null,
        }),
      ),
    );

    const won = results.filter((r) => r.data != null).length;
    expect(won).toBe(1);

    const { count } = await admin()
      .from("booking_requests")
      .select("id", { count: "exact", head: true })
      .eq("flash_item_id", itemId);
    expect(count).toBe(1);
  });

  test("book_flash_item caps a limited design at max_bookings", async () => {
    const itemId = await createTestFlashItem(artistA().id, {
      bookingMode: "limited",
      maxBookings: 3,
    });

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        admin().rpc("book_flash_item", {
          p_flash_item_id: itemId,
          p_artist_id: artistA().id,
          p_booking_id: randomUUID(),
          p_form_data: { placement: "arm" },
          p_preferred_date: null,
          p_customer_email: null,
          p_customer_handle: null,
          p_customer_token_hash: null,
          p_flash_day_id: null,
        }),
      ),
    );

    const won = results.filter((r) => r.data != null).length;
    expect(won).toBe(3);
  });

  test("book_flash_item never blocks a repeatable design", async () => {
    const itemId = await createTestFlashItem(artistA().id, {
      bookingMode: "repeatable",
    });

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        admin().rpc("book_flash_item", {
          p_flash_item_id: itemId,
          p_artist_id: artistA().id,
          p_booking_id: randomUUID(),
          p_form_data: { placement: "arm" },
          p_preferred_date: null,
          p_customer_email: null,
          p_customer_handle: null,
          p_customer_token_hash: null,
          p_flash_day_id: null,
        }),
      ),
    );

    expect(results.filter((r) => r.data != null).length).toBe(5);
  });

  test("increment_fee_sponsored_used does not lose concurrent increments", async () => {
    // Give artist A a sponsorship budget row starting at 0.
    await admin()
      .from("account_overrides")
      .upsert(
        { artist_id: artistA().id, fee_sponsored_used_cents: 0 },
        { onConflict: "artist_id" },
      );

    // 20 concurrent +7 increments must total exactly 140 (no lost updates).
    await Promise.all(
      Array.from({ length: 20 }, () =>
        admin().rpc("increment_fee_sponsored_used", {
          p_artist_id: artistA().id,
          p_cents: 7,
        }),
      ),
    );

    const { data } = await admin()
      .from("account_overrides")
      .select("fee_sponsored_used_cents")
      .eq("artist_id", artistA().id)
      .single();
    expect(data?.fee_sponsored_used_cents).toBe(140);
  });
});
