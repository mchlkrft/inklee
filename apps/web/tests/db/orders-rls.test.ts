import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, makeActor, type Actor } from "./helpers/actor";
import { PgSession } from "./helpers/pg-session";

/**
 * Authenticated database regression tests for migration 0146 (PAY-AUTHZ-002 /
 * counsel Q8): `orders` and `order_items`.
 *
 * Both tables carried a single FOR ALL policy — order_items' was even NAMED
 * "artist can read own order items" while granting INSERT/UPDATE/DELETE, which
 * is exactly why it survived review. A security reviewer proved the writes by
 * execution: an artist's own authenticated session could rewrite
 * total_amount, platform_fee_amount, created_at, and flip status from paid to
 * cancelled on their own historical order. Migration 0142 later added
 * order_items.custom_made_snapshot to FREEZE a consumer-rights disclosure at
 * sale time, so the same writable policy also let an artist retroactively
 * falsify what a past buyer's receipt says about their return right.
 *
 * Same posture as `refunds` / `refund_lines` (0139) and `payment_allocations`
 * / `payment_collections` (0125): SELECT-only for the owning artist, every
 * other verb service-role-only. A service-role client bypasses RLS entirely,
 * so every negative test here uses the real anon-key client under a real JWT
 * (`owner.client` / `other.client`), and the admin client only sets up
 * fixtures and asserts on ground truth.
 */

const ADMIN_LABEL = "payauthz002";

let admin: SupabaseClient;
let owner: Actor;
let other: Actor;

type Fixtures = {
  bookingId: string;
  orderId: string;
  itemId: string;
};

const fixtures = new Map<string, Fixtures>();

async function makeFixtures(actor: Actor): Promise<Fixtures> {
  const booking = await admin
    .from("booking_requests")
    .insert({ artist_id: actor.id })
    .select("id")
    .single();
  expect(booking.error, booking.error?.message).toBeNull();
  const bookingId = booking.data!.id as string;

  const order = await admin
    .from("orders")
    .insert({
      artist_id: actor.id,
      booking_id: bookingId,
      status: "paid",
      deposit_amount: 0,
      goods_amount: 50,
      subtotal_amount: 50,
      platform_fee_amount: 5,
      stripe_payment_intent_id: `pi_payauthz002_${actor.id.slice(0, 8)}_${Date.now()}`,
    })
    .select("id")
    .single();
  expect(order.error, order.error?.message).toBeNull();
  const orderId = order.data!.id as string;

  const item = await admin
    .from("order_items")
    .insert({
      order_id: orderId,
      type: "product",
      title_snapshot: "PAY-AUTHZ-002 fixture item",
      unit_amount: 50,
      total_amount: 50,
      custom_made_snapshot: false,
    })
    .select("id")
    .single();
  expect(item.error, item.error?.message).toBeNull();
  const itemId = item.data!.id as string;

  return { bookingId, orderId, itemId };
}

function fx(actor: Actor): Fixtures {
  const f = fixtures.get(actor.id);
  if (!f) throw new Error("fixtures missing");
  return f;
}

async function purge(actor: Actor | undefined): Promise<void> {
  if (!actor) return;
  await admin
    .from("order_items")
    .delete()
    .eq("id", fixtures.get(actor.id)?.itemId ?? "");
  await admin.from("orders").delete().eq("artist_id", actor.id);
  await admin.from("booking_requests").delete().eq("artist_id", actor.id);
}

beforeAll(async () => {
  admin = adminClient();
  owner = await makeActor(admin, `${ADMIN_LABEL}-owner`);
  other = await makeActor(admin, `${ADMIN_LABEL}-other`);
  fixtures.set(owner.id, await makeFixtures(owner));
  fixtures.set(other.id, await makeFixtures(other));
}, 60_000);

afterAll(async () => {
  await purge(owner);
  await purge(other);
  await admin.from("profiles").delete().eq("id", owner.id);
  await admin.from("profiles").delete().eq("id", other.id);
  await admin.auth.admin.deleteUser(owner.id);
  await admin.auth.admin.deleteUser(other.id);
}, 60_000);

// ===========================================================================

describe("orders: SELECT-only for the owning artist", () => {
  it("an artist CAN read their own order, including the amounts and status", async () => {
    // POSITIVE CONTROL for the whole block: without it, "this client cannot
    // reach the table" would satisfy every refusal below.
    const { data, error } = await owner.client
      .from("orders")
      .select("id, status, platform_fee_amount, created_at")
      .eq("id", fx(owner).orderId);
    expect(error, error?.message).toBeNull();
    expect(data ?? []).toHaveLength(1);
    expect(data?.[0].status).toBe("paid");
    expect(Number(data?.[0].platform_fee_amount)).toBe(5);
  });

  it("cannot SELECT another artist's order", async () => {
    const { data, error } = await other.client
      .from("orders")
      .select("id")
      .eq("id", fx(owner).orderId);
    expect(error, error?.message).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("an artist cannot INSERT an order on their own client", async () => {
    const { error } = await owner.client.from("orders").insert({
      artist_id: owner.id,
      booking_id: fx(owner).bookingId,
      status: "paid",
      deposit_amount: 0,
      goods_amount: 999,
      subtotal_amount: 999,
    });
    expect(error?.code, "expected a permission rejection").toBe("42501");
  });

  it("an artist cannot UPDATE their own order's status (paid -> cancelled)", async () => {
    const { error } = await owner.client
      .from("orders")
      .update({ status: "cancelled" })
      .eq("id", fx(owner).orderId);
    expect(error?.code, "expected a permission rejection").toBe("42501");

    const { data: after } = await admin
      .from("orders")
      .select("status")
      .eq("id", fx(owner).orderId)
      .single();
    expect(after?.status, "the order must be untouched").toBe("paid");
  });

  it("an artist cannot UPDATE their own order's platform_fee_amount", async () => {
    const { error } = await owner.client
      .from("orders")
      .update({ platform_fee_amount: 0 })
      .eq("id", fx(owner).orderId);
    expect(error?.code, "expected a permission rejection").toBe("42501");

    const { data: after } = await admin
      .from("orders")
      .select("platform_fee_amount")
      .eq("id", fx(owner).orderId)
      .single();
    expect(
      Number(after?.platform_fee_amount),
      "the fee must be untouched",
    ).toBe(5);
  });

  it("an artist cannot UPDATE their own order's created_at", async () => {
    const { data: before } = await admin
      .from("orders")
      .select("created_at")
      .eq("id", fx(owner).orderId)
      .single();

    const { error } = await owner.client
      .from("orders")
      .update({ created_at: "2000-01-01T00:00:00Z" })
      .eq("id", fx(owner).orderId);
    expect(error?.code, "expected a permission rejection").toBe("42501");

    const { data: after } = await admin
      .from("orders")
      .select("created_at")
      .eq("id", fx(owner).orderId)
      .single();
    expect(after?.created_at, "created_at must be untouched").toBe(
      before?.created_at,
    );
  });

  it("an artist cannot DELETE their own order", async () => {
    const { error } = await owner.client
      .from("orders")
      .delete()
      .eq("id", fx(owner).orderId);
    expect(error?.code, "expected a permission rejection").toBe("42501");

    const { data: still } = await admin
      .from("orders")
      .select("id")
      .eq("id", fx(owner).orderId);
    expect(still ?? [], "the order must survive").toHaveLength(1);
  });

  it("an artist cannot TRUNCATE the orders table", async () => {
    // TRUNCATE ignores RLS entirely; only the 0146 REVOKE holds it off.
    const session = PgSession.open("payauthz002-truncate");
    try {
      await session.begin();
      await session.becomeArtist(owner.id);
      let code: string | undefined;
      try {
        await session.query("truncate orders");
      } catch (e) {
        code = (e as { code?: string }).code;
      }
      expect(code, "TRUNCATE must be refused by the grant").toBe("42501");
      await session.rollbackIfOpen();
    } finally {
      await session.close();
    }
    const { count } = await admin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("artist_id", owner.id);
    expect(count ?? 0, "the artist's orders must survive").toBeGreaterThan(0);
  });

  it("still accepts writes as the service role", async () => {
    // POSITIVE CONTROL: every rejection above is about the ROLE, not about
    // orders being unwritable at all — the money path (webhook, checkout,
    // refund cores) writes this table through the service-role client.
    const { error } = await admin
      .from("orders")
      .update({ platform_fee_amount: 7 })
      .eq("id", fx(owner).orderId);
    expect(error, error?.message).toBeNull();

    // Restore, so later tests in this file see the fixture's original value.
    await admin
      .from("orders")
      .update({ platform_fee_amount: 5 })
      .eq("id", fx(owner).orderId);
  });
});

// ===========================================================================

describe("order_items: SELECT-only for the owning artist", () => {
  it("an artist CAN read their own order item, including custom_made_snapshot", async () => {
    // POSITIVE CONTROL for the whole block.
    const { data, error } = await owner.client
      .from("order_items")
      .select("id, total_amount, title_snapshot, custom_made_snapshot")
      .eq("id", fx(owner).itemId);
    expect(error, error?.message).toBeNull();
    expect(data ?? []).toHaveLength(1);
    expect(Number(data?.[0].total_amount)).toBe(50);
    expect(data?.[0].custom_made_snapshot).toBe(false);
  });

  it("cannot SELECT another artist's order item", async () => {
    const { data, error } = await other.client
      .from("order_items")
      .select("id")
      .eq("id", fx(owner).itemId);
    expect(error, error?.message).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("an artist cannot INSERT an order item on their own client", async () => {
    const { error } = await owner.client.from("order_items").insert({
      order_id: fx(owner).orderId,
      type: "product",
      title_snapshot: "Forged item",
      unit_amount: 1,
      total_amount: 1,
    });
    expect(error?.code, "expected a permission rejection").toBe("42501");
  });

  it("an artist cannot UPDATE total_amount on their own order item", async () => {
    const { error } = await owner.client
      .from("order_items")
      .update({ total_amount: 999999 })
      .eq("id", fx(owner).itemId);
    expect(error?.code, "expected a permission rejection").toBe("42501");

    const { data: after } = await admin
      .from("order_items")
      .select("total_amount")
      .eq("id", fx(owner).itemId)
      .single();
    expect(Number(after?.total_amount), "the amount must be untouched").toBe(
      50,
    );
  });

  // The counsel-flagged column (migration 0142): freezes the Art. 16(c) CRD
  // no-return disclosure at sale time. Rewriting it after the fact is a
  // retroactive change to what a past buyer's receipt says about their
  // return right, not merely a pricing forgery.
  it("an artist cannot UPDATE custom_made_snapshot on their own order item", async () => {
    const { error } = await owner.client
      .from("order_items")
      .update({ custom_made_snapshot: true })
      .eq("id", fx(owner).itemId);
    expect(error?.code, "expected a permission rejection").toBe("42501");

    const { data: after } = await admin
      .from("order_items")
      .select("custom_made_snapshot")
      .eq("id", fx(owner).itemId)
      .single();
    expect(
      after?.custom_made_snapshot,
      "the disclosure snapshot must be untouched",
    ).toBe(false);
  });

  it("an artist cannot UPDATE title_snapshot on their own order item", async () => {
    const { error } = await owner.client
      .from("order_items")
      .update({ title_snapshot: "Relabelled after the sale" })
      .eq("id", fx(owner).itemId);
    expect(error?.code, "expected a permission rejection").toBe("42501");

    const { data: after } = await admin
      .from("order_items")
      .select("title_snapshot")
      .eq("id", fx(owner).itemId)
      .single();
    expect(after?.title_snapshot, "the title snapshot must be untouched").toBe(
      "PAY-AUTHZ-002 fixture item",
    );
  });

  it("an artist cannot DELETE their own order item", async () => {
    const { error } = await owner.client
      .from("order_items")
      .delete()
      .eq("id", fx(owner).itemId);
    expect(error?.code, "expected a permission rejection").toBe("42501");

    const { data: still } = await admin
      .from("order_items")
      .select("id")
      .eq("id", fx(owner).itemId);
    expect(still ?? [], "the order item must survive").toHaveLength(1);
  });

  it("an artist cannot TRUNCATE the order_items table", async () => {
    const session = PgSession.open("payauthz002-truncate-items");
    try {
      await session.begin();
      await session.becomeArtist(owner.id);
      let code: string | undefined;
      try {
        await session.query("truncate order_items");
      } catch (e) {
        code = (e as { code?: string }).code;
      }
      expect(code, "TRUNCATE must be refused by the grant").toBe("42501");
      await session.rollbackIfOpen();
    } finally {
      await session.close();
    }
    const { count } = await admin
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .eq("id", fx(owner).itemId);
    expect(count ?? 0, "the item must survive").toBeGreaterThan(0);
  });

  it("still accepts writes as the service role", async () => {
    // POSITIVE CONTROL: order_items is service-role-write, not unwritable.
    const { error } = await admin
      .from("order_items")
      .update({ quantity: 2 })
      .eq("id", fx(owner).itemId);
    expect(error, error?.message).toBeNull();

    await admin
      .from("order_items")
      .update({ quantity: 1 })
      .eq("id", fx(owner).itemId);
  });
});

// ===========================================================================

describe("orders_stripe_pi_idx: UNIQUE partial index (PAY-AUTHZ-002)", () => {
  const createdOrderIds: string[] = [];

  afterAll(async () => {
    if (createdOrderIds.length > 0) {
      await admin.from("orders").delete().in("id", createdOrderIds);
    }
  });

  it("refuses a second order sharing an already-used PaymentIntent id", async () => {
    const pi = `pi_payauthz002_unique_${Date.now()}`;
    const first = await admin
      .from("orders")
      .insert({
        artist_id: owner.id,
        booking_id: fx(owner).bookingId,
        status: "paid",
        deposit_amount: 0,
        goods_amount: 20,
        subtotal_amount: 20,
        stripe_payment_intent_id: pi,
      })
      .select("id")
      .single();
    expect(first.error, first.error?.message).toBeNull();
    createdOrderIds.push(first.data!.id as string);

    const second = await admin.from("orders").insert({
      artist_id: other.id,
      booking_id: fx(other).bookingId,
      status: "paid",
      deposit_amount: 0,
      goods_amount: 20,
      subtotal_amount: 20,
      stripe_payment_intent_id: pi,
    });
    expect(second.error?.code, "expected a uniqueness violation").toBe("23505");
  });

  it("still allows two orders with no PaymentIntent id (both null)", async () => {
    // POSITIVE CONTROL: the index is PARTIAL (WHERE stripe_payment_intent_id
    // IS NOT NULL) — a pending order created before Stripe assigns a PI must
    // not collide with every other pending order.
    const a = await admin
      .from("orders")
      .insert({
        artist_id: owner.id,
        booking_id: fx(owner).bookingId,
        status: "pending",
        deposit_amount: 0,
        goods_amount: 10,
        subtotal_amount: 10,
      })
      .select("id")
      .single();
    expect(a.error, a.error?.message).toBeNull();
    createdOrderIds.push(a.data!.id as string);

    const b = await admin
      .from("orders")
      .insert({
        artist_id: owner.id,
        booking_id: fx(owner).bookingId,
        status: "pending",
        deposit_amount: 0,
        goods_amount: 10,
        subtotal_amount: 10,
      })
      .select("id")
      .single();
    expect(b.error, b.error?.message).toBeNull();
    createdOrderIds.push(b.data!.id as string);
  });
});
