import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, makeActor, type Actor } from "./helpers/actor";
import { PgSession } from "./helpers/pg-session";

/**
 * Authenticated database regression tests for migration 0139 (FD12): `refunds`
 * and `refund_lines`.
 *
 * Same posture as `payment_allocations` / `payment_collections` (0125), and
 * this file follows `appointment-payments-rls.test.ts`'s pattern rather than
 * inventing a new one: SELECT-only for the owning artist, every other verb
 * service-role-only, and cross-owner rows unrepresentable for EVERY role
 * (composite FKs), because a refund is the record of money that moved (or was
 * decided to move) and an artist's own client asserting one directly could
 * manufacture refund history that never happened at Stripe.
 */

const ADMIN_LABEL = "fd12";

let admin: SupabaseClient;
let owner: Actor;
let other: Actor;

type Fixtures = {
  bookingId: string;
  requestId: string;
  lineId: string;
  orderId: string;
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

  const request = await admin
    .from("payment_requests")
    .insert({ artist_id: actor.id, booking_id: bookingId, total_minor: 5000 })
    .select("id")
    .single();
  expect(request.error, request.error?.message).toBeNull();
  const requestId = request.data!.id as string;

  const line = await admin
    .from("payment_request_lines")
    .insert({
      request_id: requestId,
      artist_id: actor.id,
      name: "FD12 fixture line",
      quantity: 1,
      unit_amount_minor: 5000,
      line_total_minor: 5000,
      classification: "tattoo_service",
    })
    .select("id")
    .single();
  expect(line.error, line.error?.message).toBeNull();
  const lineId = line.data!.id as string;

  const order = await admin
    .from("orders")
    .insert({
      artist_id: actor.id,
      booking_id: bookingId,
      status: "paid",
      deposit_amount: 0,
      goods_amount: 50,
      subtotal_amount: 50,
      stripe_payment_intent_id: `pi_fd12_${actor.id.slice(0, 8)}`,
    })
    .select("id")
    .single();
  expect(order.error, order.error?.message).toBeNull();
  const orderId = order.data!.id as string;

  return { bookingId, requestId, lineId, orderId };
}

function fx(actor: Actor): Fixtures {
  const f = fixtures.get(actor.id);
  if (!f) throw new Error("fixtures missing");
  return f;
}

async function insertRefund(
  actor: Actor,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; error: { code?: string; message?: string } | null }> {
  const base = {
    domain: "appointment_payment",
    artist_id: actor.id,
    payment_request_id: fx(actor).requestId,
    order_id: null,
    refund_type: "full",
    fee_refund_case: "voluntary_full",
    status: "succeeded",
    amount_minor: 1000,
    stripe_refund_id: `re_fd12_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    idempotency_key: `idem-fd12-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    initiated_by: actor.id,
    ...overrides,
  };
  const { data, error } = await admin
    .from("refunds")
    .insert(base)
    .select("id")
    .single();
  return { id: data?.id as string, error };
}

async function purge(actor: Actor | undefined): Promise<void> {
  if (!actor) return;
  await admin.from("refund_lines").delete().eq("artist_id", actor.id);
  await admin.from("refunds").delete().eq("artist_id", actor.id);
  await admin.from("payment_request_lines").delete().eq("artist_id", actor.id);
  await admin.from("payment_requests").delete().eq("artist_id", actor.id);
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

describe("refunds: SELECT-only for the owning artist", () => {
  it("an artist CAN read their own refund", async () => {
    // POSITIVE CONTROL for the whole block: without it, "this client cannot
    // reach the table" would satisfy every refusal below.
    const { id, error } = await insertRefund(owner);
    expect(error, error?.message).toBeNull();

    const { data, error: selErr } = await owner.client
      .from("refunds")
      .select("id, amount_minor")
      .eq("id", id);
    expect(selErr, selErr?.message).toBeNull();
    expect(data ?? []).toHaveLength(1);
    expect(data?.[0].amount_minor).toBe(1000);
  });

  it("cannot SELECT another artist's refund", async () => {
    const { id } = await insertRefund(owner);
    const { data, error } = await other.client
      .from("refunds")
      .select("id")
      .eq("id", id);
    expect(error, error?.message).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("an artist cannot INSERT a refund on their own client", async () => {
    // The 0120/0118 defect, mirrored: an artist who could insert one could
    // manufacture a refund event that never happened at Stripe.
    const { error } = await owner.client.from("refunds").insert({
      domain: "appointment_payment",
      artist_id: owner.id,
      payment_request_id: fx(owner).requestId,
      refund_type: "full",
      fee_refund_case: "voluntary_full",
      status: "succeeded",
      amount_minor: 500,
      stripe_refund_id: "re_forged",
      idempotency_key: `idem-forged-${Date.now()}`,
      initiated_by: owner.id,
    });
    expect(error?.code, "expected a permission rejection").toBe("42501");
    expect(error?.message).toContain("permission denied");
  });

  it("an artist cannot UPDATE a refund to fabricate a different outcome", async () => {
    const { id } = await insertRefund(owner, {
      status: "failed",
      error_message: "boom",
      stripe_refund_id: null,
    });
    const { error } = await owner.client
      .from("refunds")
      .update({ status: "succeeded", stripe_refund_id: "re_fabricated" })
      .eq("id", id);
    expect(error?.code, "expected a permission rejection").toBe("42501");

    const { data: after } = await admin
      .from("refunds")
      .select("status")
      .eq("id", id)
      .single();
    expect(after?.status, "the row must be untouched").toBe("failed");
  });

  it("an artist cannot DELETE a refund", async () => {
    const { id } = await insertRefund(owner);
    const { error } = await owner.client.from("refunds").delete().eq("id", id);
    expect(error?.code, "expected a permission rejection").toBe("42501");

    const { data: still } = await admin
      .from("refunds")
      .select("id")
      .eq("id", id);
    expect(still ?? [], "the refund must survive").toHaveLength(1);
  });

  it("an artist cannot TRUNCATE the refunds table", async () => {
    // TRUNCATE ignores RLS entirely; only the 0139 REVOKE holds it off.
    await insertRefund(owner);
    const session = PgSession.open("fd12-truncate");
    try {
      await session.begin();
      await session.becomeArtist(owner.id);
      let code: string | undefined;
      try {
        await session.query("truncate refunds");
      } catch (e) {
        code = (e as { code?: string }).code;
      }
      expect(code, "TRUNCATE must be refused by the grant").toBe("42501");
      await session.rollbackIfOpen();
    } finally {
      await session.close();
    }
    const { count } = await admin
      .from("refunds")
      .select("id", { count: "exact", head: true })
      .eq("artist_id", owner.id);
    expect(count ?? 0, "the artist's refunds must survive").toBeGreaterThan(0);
  });
});

describe("refunds: cross-owner rows are unrepresentable, even for the service role", () => {
  it("refuses a refund against another artist's payment request (refunds_payment_request_fk)", async () => {
    const { error } = await insertRefund(owner, {
      payment_request_id: fx(other).requestId,
    });
    expect(error?.code, "expected a foreign-key violation").toBe("23503");
  });

  it("refuses a refund against another artist's order (refunds_order_fk)", async () => {
    const { error } = await insertRefund(owner, {
      domain: "goods_order",
      payment_request_id: null,
      order_id: fx(other).orderId,
    });
    expect(error?.code, "expected a foreign-key violation").toBe("23503");
  });

  it("refuses a domain/subject mismatch (refunds_subject_check)", async () => {
    const { error } = await insertRefund(owner, {
      domain: "goods_order",
      // payment_request_id still set from the override base, order_id left null
      order_id: null,
    });
    expect(error?.code, "expected a check-constraint violation").toBe("23514");
  });

  it("refuses a duplicate idempotency_key (refunds_idempotency_key_key) — the claim gate's floor", async () => {
    const key = `idem-fd12-dup-${Date.now()}`;
    const first = await insertRefund(owner, { idempotency_key: key });
    expect(first.error, first.error?.message).toBeNull();
    const second = await insertRefund(owner, {
      idempotency_key: key,
      stripe_refund_id: `re_fd12_dup_${Date.now()}`,
    });
    expect(second.error?.code, "expected a uniqueness violation").toBe("23505");
  });

  it("still accepts a correct goods_order refund as the service role", async () => {
    // POSITIVE CONTROL: every rejection above is about ownership/shape, not
    // about the service role being unable to write this table at all.
    const { error } = await insertRefund(owner, {
      domain: "goods_order",
      payment_request_id: null,
      order_id: fx(owner).orderId,
    });
    expect(error, error?.message).toBeNull();
  });
});

// ===========================================================================

describe("refund_lines: SELECT-only for the owning artist", () => {
  async function insertLine(
    actor: Actor,
    refundId: string,
    overrides: Record<string, unknown> = {},
  ) {
    return admin
      .from("refund_lines")
      .insert({
        refund_id: refundId,
        artist_id: actor.id,
        payment_request_id: fx(actor).requestId,
        payment_request_line_id: fx(actor).lineId,
        name_snapshot: "FD12 fixture line",
        quantity_refunded: 1,
        amount_minor: 1000,
        ...overrides,
      })
      .select("id")
      .single();
  }

  it("an artist CAN read their own refund line", async () => {
    const { id: refundId } = await insertRefund(owner);
    const { data: line, error } = await insertLine(owner, refundId);
    expect(error, error?.message).toBeNull();

    const { data, error: selErr } = await owner.client
      .from("refund_lines")
      .select("id, amount_minor")
      .eq("id", line!.id);
    expect(selErr, selErr?.message).toBeNull();
    expect(data ?? []).toHaveLength(1);
  });

  it("cannot SELECT another artist's refund line", async () => {
    const { id: refundId } = await insertRefund(owner);
    const { data: line } = await insertLine(owner, refundId);

    const { data, error } = await other.client
      .from("refund_lines")
      .select("id")
      .eq("id", line!.id);
    expect(error, error?.message).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("an artist cannot INSERT, UPDATE or DELETE a refund line on their own client", async () => {
    const { id: refundId } = await insertRefund(owner);

    const insert = await owner.client.from("refund_lines").insert({
      refund_id: refundId,
      artist_id: owner.id,
      payment_request_id: fx(owner).requestId,
      payment_request_line_id: fx(owner).lineId,
      name_snapshot: "Forged",
      amount_minor: 500,
    });
    expect(insert.error?.code, "INSERT expected a permission rejection").toBe(
      "42501",
    );

    const { data: line } = await insertLine(owner, refundId);
    const update = await owner.client
      .from("refund_lines")
      .update({ amount_minor: 999999 })
      .eq("id", line!.id);
    expect(update.error?.code, "UPDATE expected a permission rejection").toBe(
      "42501",
    );

    const del = await owner.client
      .from("refund_lines")
      .delete()
      .eq("id", line!.id);
    expect(del.error?.code, "DELETE expected a permission rejection").toBe(
      "42501",
    );

    const { data: after } = await admin
      .from("refund_lines")
      .select("amount_minor")
      .eq("id", line!.id)
      .single();
    expect(after?.amount_minor, "the row must be untouched").toBe(1000);
  });

  it("refuses a line row whose artist disagrees with its refund's owner (refund_lines_refund_fk)", async () => {
    const { id: refundId } = await insertRefund(owner);
    const { error } = await insertLine(other, refundId, {
      // other's own request/line, but attributed to owner's refund.
      payment_request_id: fx(other).requestId,
      payment_request_line_id: fx(other).lineId,
    });
    expect(error?.code, "expected a foreign-key violation").toBe("23503");
  });

  it("refuses a line naming BOTH a request line and an order item (refund_lines_subject_check)", async () => {
    const { id: refundId } = await insertRefund(owner, {
      domain: "goods_order",
      payment_request_id: null,
      order_id: fx(owner).orderId,
    });
    // Fetch a real order_item to reference; none exists in this fixture, so
    // this proves the CHECK fires before any FK on order_item_id is even
    // consulted (num_nonnulls <= 1 catches it first with a fabricated id).
    const { error } = await insertLine(owner, refundId, {
      order_id: fx(owner).orderId,
      order_item_id: "00000000-0000-0000-0000-000000000000",
    });
    expect(error?.code, "expected a check-constraint violation").toBe("23514");
  });

  it("still accepts a correct line as the service role", async () => {
    const { id: refundId } = await insertRefund(owner);
    const { error } = await insertLine(owner, refundId);
    expect(error, error?.message).toBeNull();
  });
});
