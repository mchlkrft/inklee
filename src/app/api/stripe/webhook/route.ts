import { NextResponse } from "next/server";
import Stripe from "stripe";
import { serviceClient } from "@/lib/supabase/service";
import { sendBookingEmail } from "@/lib/email/send-booking-email";

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
        "id, status, customer_email, customer_handle, preferred_date, form_data, artist_id",
      )
      .eq("id", bookingId)
      .single();

    if (fetchError || !booking) {
      return NextResponse.json({ error: "booking not found" }, { status: 404 });
    }

    // Idempotent — skip if already processed
    if (
      booking.status === "approved" ||
      booking.status === "rejected" ||
      booking.status === "cancelled"
    ) {
      return NextResponse.json({ received: true, skipped: true });
    }

    // Generate new magic-link token for the customer
    const crypto = await import("crypto");
    const newToken = crypto.randomBytes(32).toString("hex");
    const newHash = crypto.createHash("sha256").update(newToken).digest("hex");

    const { error: updateError } = await serviceClient
      .from("booking_requests")
      .update({
        status: "approved",
        deposit_paid_at: now,
        decided_at: now,
        updated_at: now,
        customer_token_hash: newHash,
      })
      .eq("id", bookingId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    await serviceClient.from("audit_log").insert({
      booking_id: bookingId,
      action: "deposit_paid",
      details: {
        payment_intent_id: intent.id,
        amount_eur: intent.amount / 100,
        via: "stripe_webhook",
      },
    });

    // Send approval email to customer
    if (booking.customer_email) {
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
          size: fd?.size ?? "",
          date: booking.preferred_date ?? "",
          magic_link: `${appUrl}/request/${newToken}`,
        },
      });
    }
  }

  return NextResponse.json({ received: true });
}
