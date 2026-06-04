import { NextResponse } from "next/server";
import Stripe from "stripe";
import { serviceClient } from "@/lib/supabase/service";
import { formatSize } from "@/lib/booking-schema";
import {
  sendBookingEmail,
  sendGoodsOrderConfirmation,
  sendArtistDepositPaidEmail,
  sendClientDepositReceiptEmail,
} from "@/lib/email/send-booking-email";
import {
  decrementInventory,
  type PaidOrderItem,
} from "@/lib/order-fulfillment";
import { createNotification } from "@/lib/notifications";
import { revalidateBookingViews } from "@/lib/revalidate-bookings";
import { customerLabel } from "@/lib/booking-domain";
import { resolveStudioForBooking } from "@/lib/booking-studio";
import {
  clearConnectAccountByExternalId,
  persistConnectAccountFromEvent,
} from "@/lib/stripe-connect";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret || !webhookSecret) {
    return NextResponse.json(
      { error: "Stripe not configured" },
      { status: 400 },
    );
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  const stripe = new Stripe(secret);

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  // OT-12 Connect events: keep the artist's connected-account state in sync.
  // No money flows from these — they purely mirror Stripe's view of the
  // account into `profiles.stripe_*`. Charge integration arrives in OT-12.2.
  if (event.type === "account.updated") {
    const account = event.data.object as Stripe.Account;
    // L-1: defensive consistency check — the event's connected-account context
    // should match the object it carries. They always do for account.updated,
    // but assert before mutating our state off the payload.
    if (event.account && event.account !== account.id) {
      return NextResponse.json({ received: true });
    }
    const result = await persistConnectAccountFromEvent(account);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({ received: true });
  }

  if (event.type === "account.application.deauthorized") {
    // `event.account` is the connected-account id when an artist disconnects
    // the Inklee platform from inside their Stripe dashboard.
    const accountId = typeof event.account === "string" ? event.account : null;
    if (accountId) {
      const result = await clearConnectAccountByExternalId(accountId);
      if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: 500 });
      }
    }
    return NextResponse.json({ received: true });
  }

  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object as Stripe.PaymentIntent;
    const bookingId = intent.metadata?.booking_id;

    if (!bookingId) {
      return NextResponse.json(
        { error: "missing booking_id in metadata" },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();

    const { data: booking, error: fetchError } = await serviceClient
      .from("booking_requests")
      .select(
        "id, status, customer_email, customer_handle, preferred_date, form_data, artist_id, deposit_amount, deposit_payment_intent_id, deposit_policy_snapshot",
      )
      .eq("id", bookingId)
      .single();

    if (fetchError || !booking) {
      return NextResponse.json({ error: "booking not found" }, { status: 404 });
    }

    // Booking-side idempotency. The audit_log row + the booking's terminal
    // status BOTH signal that the deposit was already processed. We compute
    // this up front but no longer short-circuit the whole handler — the
    // order-side fulfillment (flip → paid + decrement inventory) has its
    // own `.select()`-gated guard further down and must be free to run on a
    // retry that catches up after a partial failure (e.g. booking succeeded
    // but the order flip threw last time).
    const { count: alreadyLogged } = await serviceClient
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("booking_id", bookingId)
      .eq("action", "deposit_paid")
      .contains("details", { payment_intent_id: intent.id });

    const bookingTerminal =
      booking.status === "approved" ||
      booking.status === "rejected" ||
      booking.status === "cancelled";
    const bookingAlreadyDone = (alreadyLogged ?? 0) > 0 || bookingTerminal;

    // Reject only when the booking is in a status the deposit webhook can't
    // legitimately advance from AND nothing's been logged yet — that's a
    // bad request, not a retry. If the booking is already approved (terminal
    // success) we still allow the order-side flip below.
    if (!bookingAlreadyDone && booking.status !== "deposit_pending") {
      return NextResponse.json(
        { error: "booking is not awaiting a deposit" },
        { status: 409 },
      );
    }
    if (
      bookingAlreadyDone &&
      (booking.status === "rejected" || booking.status === "cancelled")
    ) {
      // Audit said this intent has been logged, but the booking is in a
      // terminal-rejected state — nothing more to do.
      return NextResponse.json({ received: true, skipped: true });
    }

    // Combined deposit + goods order (Slice 74). When metadata carries an
    // order_id, the intent amount equals the order subtotal, not the deposit.
    const orderId = intent.metadata?.order_id || null;
    let order: {
      id: string;
      status: string;
      subtotal_amount: string | number;
    } | null = null;
    if (orderId) {
      const { data: orderRow } = await serviceClient
        .from("orders")
        .select("id, status, booking_id, subtotal_amount")
        .eq("id", orderId)
        .single();
      if (!orderRow || orderRow.booking_id !== bookingId) {
        return NextResponse.json(
          { error: "order does not match this booking" },
          { status: 409 },
        );
      }
      order = orderRow;
    }

    const expectedAmount = order
      ? Math.round(Number(order.subtotal_amount) * 100)
      : booking.deposit_amount
        ? Math.round(Number(booking.deposit_amount) * 100)
        : null;

    if (expectedAmount === null || Number.isNaN(expectedAmount)) {
      return NextResponse.json(
        { error: "booking deposit amount is missing" },
        { status: 409 },
      );
    }

    if (intent.amount !== expectedAmount) {
      return NextResponse.json(
        {
          error: `payment amount mismatch: expected ${expectedAmount}, received ${intent.amount}`,
        },
        { status: 409 },
      );
    }

    if (
      booking.deposit_payment_intent_id &&
      booking.deposit_payment_intent_id !== intent.id
    ) {
      return NextResponse.json(
        { error: "payment intent does not match this booking" },
        { status: 409 },
      );
    }

    // Booking-side write: only on the first successful delivery for this
    // intent. Token rotation, status flip, audit row all gated together so a
    // partial-failure retry doesn't double-rotate the magic link.
    let bookingSideRanThisCall = false;
    let newToken: string | null = null;
    if (!bookingAlreadyDone) {
      const crypto = await import("crypto");
      newToken = crypto.randomBytes(32).toString("hex");
      const newHash = crypto
        .createHash("sha256")
        .update(newToken)
        .digest("hex");

      const { error: updateError } = await serviceClient
        .from("booking_requests")
        .update({
          status: "approved",
          deposit_paid_at: now,
          decided_at: now,
          updated_at: now,
          deposit_payment_intent_id: intent.id,
          customer_token_hash: newHash,
        })
        .eq("id", bookingId);

      if (updateError) {
        return NextResponse.json(
          { error: updateError.message },
          { status: 500 },
        );
      }

      await serviceClient.from("audit_log").insert({
        booking_id: bookingId,
        action: "deposit_paid",
        details: {
          payment_intent_id: intent.id,
          amount_eur: intent.amount / 100,
          // The gross 3% application fee Inklee collected on this deposit
          // (Custom Connect: Stripe's processing fee is then billed to Inklee's
          // platform balance, so net keep is this minus Stripe's cut). 0 for
          // manual / pre-fee intents. Logged for revenue reconciliation.
          application_fee_eur: (intent.application_fee_amount ?? 0) / 100,
          via: "stripe_webhook",
        },
      });
      bookingSideRanThisCall = true;
    }

    // Order + fulfillment side effects (Slice 74/75). Independently
    // idempotent via the `.select()`-gated pending → paid flip — only the
    // single transaction that observes status='pending' will move it to
    // 'paid' and run `decrementInventory`. Every other retry / concurrent
    // delivery returns flipped=[] and skips the inventory step. Critically
    // this runs whether or not the booking-side already did its work above,
    // so a partial failure last time can be caught up here on retry.
    let goodsLines: {
      title: string;
      variant: string | null;
      quantity: number;
      total: number;
    }[] = [];
    let orderFlippedThisCall = false;
    if (order && order.status !== "paid") {
      const { data: flipped } = await serviceClient
        .from("orders")
        .update({
          status: "paid",
          fulfillment_status: "pending_pickup",
          updated_at: now,
        })
        .eq("id", order.id)
        .eq("status", "pending")
        .select("id");

      if (flipped && flipped.length > 0) {
        const { data: itemRows } = await serviceClient
          .from("order_items")
          .select(
            "product_id, variant_id, quantity, type, title_snapshot, variant_snapshot, total_amount",
          )
          .eq("order_id", order.id);
        const items = (itemRows ?? []) as PaidOrderItem[];
        await decrementInventory(items);
        goodsLines = items
          .filter((r) => r.type === "product")
          .map((r) => ({
            title: r.title_snapshot,
            variant: r.variant_snapshot,
            quantity: Number(r.quantity),
            total: Number(r.total_amount),
          }));
        orderFlippedThisCall = true;
      }
    }

    // If neither side advanced and the booking-side was already done last
    // time AND there's no order to catch up (or it's already paid), this is
    // a vanilla replay. Short-circuit the email/notification fan-out below.
    if (!bookingSideRanThisCall && !orderFlippedThisCall) {
      return NextResponse.json({ received: true, skipped: true });
    }

    // Artist display name for the emails/notification below.
    const { data: artistProfile } = await serviceClient
      .from("profiles")
      .select("display_name")
      .eq("id", booking.artist_id)
      .single();
    const artistDisplayName = artistProfile?.display_name ?? "the artist";
    const depositEur = booking.deposit_amount
      ? Number(booking.deposit_amount)
      : 0;
    const goodsCount = goodsLines.reduce((n, l) => n + l.quantity, 0);

    // Customer: itemised goods confirmation. Fires whenever the order flip
    // landed in THIS call (`orderFlippedThisCall`), even on a catch-up
    // retry where the booking-side ran on the previous delivery.
    if (
      orderFlippedThisCall &&
      goodsLines.length > 0 &&
      booking.customer_email
    ) {
      await sendGoodsOrderConfirmation({
        to: booking.customer_email,
        artistName: artistDisplayName,
        lines: goodsLines,
        total: order ? Number(order.subtotal_amount) : depositEur,
        currency: "eur",
      });
    }

    // Artist: deposit paid (+ goods) — only on the first delivery for this
    // booking, so a retry that's only catching up the order side does not
    // re-notify the artist about a deposit they already saw.
    if (bookingSideRanThisCall) {
      const goodsSuffix =
        goodsCount > 0
          ? ` and reserved ${goodsCount} item${goodsCount === 1 ? "" : "s"} for pickup`
          : "";
      await createNotification({
        artistId: booking.artist_id,
        type: "deposit_received",
        category: "booking_activity",
        priority: "high",
        title: "Deposit paid",
        message: `${customerLabel(booking.customer_handle, booking.customer_email, "A client")} paid their EUR ${depositEur.toFixed(2)} deposit${goodsSuffix}. Booking confirmed.`,
        ctaLabel: "View booking",
        ctaHref: `/bookings/requests/${bookingId}`,
        metadata: {
          booking_id: bookingId,
          ...(order ? { order_id: order.id } : {}),
        },
      });

      const { data: artistAuth } = await serviceClient.auth.admin.getUserById(
        booking.artist_id,
      );
      if (artistAuth?.user?.email) {
        const afd = booking.form_data as Record<string, string> | null;
        await sendArtistDepositPaidEmail({
          artistEmail: artistAuth.user.email,
          customerHandle: customerLabel(
            booking.customer_handle,
            booking.customer_email,
            "A client",
          ),
          amountEur: depositEur,
          goodsLines,
          goodsTotal: goodsLines.reduce((n, l) => n + l.total, 0),
          placement: afd?.placement ?? "",
          date: booking.preferred_date ?? "",
        });
      }
    }

    // Customer approval email — same first-delivery gate as the artist
    // emails so the magic link is only rotated/sent once.
    if (bookingSideRanThisCall && newToken && booking.customer_email) {
      const { data: profile } = await serviceClient
        .from("profiles")
        .select("display_name, slug")
        .eq("id", booking.artist_id)
        .single();

      const fd = booking.form_data as Record<string, string> | null;
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";

      await sendBookingEmail({
        type: "customer_booking_approved",
        to: booking.customer_email,
        artistId: booking.artist_id,
        vars: {
          customer_handle: booking.customer_handle ?? "",
          artist_name: profile?.display_name ?? "",
          artist_slug: profile?.slug ?? "",
          placement: fd?.placement ?? "",
          size: formatSize(fd?.size),
          date: booking.preferred_date ?? "",
          magic_link: `${appUrl}/request/${newToken}`,
        },
        studio: await resolveStudioForBooking(bookingId),
      });
    }

    // Q9 durable medium: deposit receipt to the client with the booking
    // reference, amount, and the snapshotted policy. First delivery only.
    if (bookingSideRanThisCall && booking.customer_email) {
      await sendClientDepositReceiptEmail({
        to: booking.customer_email,
        artistName: artistDisplayName,
        customerHandle: booking.customer_handle ?? "",
        amountEur: depositEur,
        bookingRef: bookingId.slice(0, 8).toUpperCase(),
        policySnapshot:
          (booking as { deposit_policy_snapshot?: string | null })
            .deposit_policy_snapshot ?? null,
      });
    }

    // Revalidate whenever ANY side advanced — picks up either the booking
    // status flip or the order's fulfillment_status change on a catch-up.
    revalidateBookingViews(bookingId);
  }

  return NextResponse.json({ received: true });
}
