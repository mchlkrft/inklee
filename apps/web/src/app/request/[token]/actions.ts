"use server";

import { serviceClient } from "@/lib/supabase/service";
import { bookingSchema } from "@/lib/booking-schema";
import {
  sendArtistCancellationByCustomer,
  sendBookingEmail,
} from "@/lib/email/send-booking-email";
import crypto from "crypto";
import { redirect } from "next/navigation";
import { revalidateBookingViews } from "@/lib/revalidate-bookings";
import { customerLabel } from "@/lib/booking-domain";
import { createNotification } from "@/lib/notifications";
import { checkPortalRateLimit } from "@/lib/ratelimit";
import { canTransition } from "@/lib/booking-fsm";
import { portalEditSupport } from "@/lib/booking-domain";
import { isDateKeyOnOrBefore, todayInTimeZone } from "@/lib/date-utils";
import { stripe } from "@/lib/stripe";
import { getAddonProducts } from "@/lib/addon-products";
import {
  computeAddonLines,
  DEPOSIT_LINE_TITLE,
  type AddonSelection,
} from "@/lib/orders";

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function isExpired(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() > 30 * 24 * 60 * 60 * 1000;
}

type State = { error: string; field?: string } | null;

export async function editCustomerBookingAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const token = formData.get("_token") as string;
  if (!token) return { error: "Invalid link." };

  const tokenHash = hashToken(token);
  const { allowed } = await checkPortalRateLimit(tokenHash);
  if (!allowed) return { error: "Too many requests. Please try again later." };

  const { data: booking } = await serviceClient
    .from("booking_requests")
    .select(
      "id, status, created_at, form_data, customer_email, preferred_date, artist_id, slot_id, trip_id, flash_item_id, customer_handle",
    )
    .eq("customer_token_hash", tokenHash)
    .single();

  if (!booking) return { error: "This link is no longer valid." };
  if (isExpired(booking.created_at)) return { error: "This link has expired." };

  const support = portalEditSupport({
    status: booking.status,
    customerEmail: booking.customer_email,
    preferredDate: booking.preferred_date,
    customerHandle: booking.customer_handle,
    slotId: booking.slot_id,
    tripId: booking.trip_id,
    flashItemId: booking.flash_item_id,
    formData: booking.form_data as Record<string, unknown> | null,
  });
  if (!support.editable) {
    return { error: support.reason };
  }

  const raw = {
    instagram_handle: formData.get("instagram_handle"),
    email: formData.get("email"),
    reference_link: formData.get("reference_link"),
    placement: formData.get("placement"),
    size: formData.get("size"),
    description: formData.get("description"),
    preferred_date: formData.get("preferred_date"),
  };

  const parsed = bookingSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { error: first.message, field: first.path[0] as string };
  }

  const data = parsed.data;

  const { data: artistProfile } = await serviceClient
    .from("profiles")
    .select("display_name, slug, timezone")
    .eq("id", booking.artist_id)
    .single();

  const artistTimeZone = artistProfile?.timezone ?? "Europe/Berlin";
  if (
    isDateKeyOnOrBefore(data.preferred_date, todayInTimeZone(artistTimeZone))
  ) {
    return {
      error: "preferred date must be a future date",
      field: "preferred_date",
    };
  }

  const newToken = crypto.randomBytes(32).toString("hex");
  const newHash = hashToken(newToken);
  const fd = (booking.form_data ?? {}) as Record<string, string>;

  const { error: updateError } = await serviceClient
    .from("booking_requests")
    .update({
      customer_handle: data.instagram_handle,
      customer_email: data.email,
      preferred_date: data.preferred_date,
      customer_token_hash: newHash,
      form_data: {
        ...fd,
        placement: data.placement,
        size: data.size,
        description: data.description,
        reference_link: data.reference_link || null,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", booking.id)
    .eq("customer_token_hash", tokenHash);

  if (updateError) return { error: "Something went wrong. Try again." };

  await serviceClient.from("audit_log").insert({
    booking_id: booking.id,
    action: "token_rotated",
    details: { old_hash: tokenHash, new_hash: newHash, by: "customer" },
  });
  await serviceClient.from("audit_log").insert({
    booking_id: booking.id,
    action: "customer_edited",
    details: { by: "customer" },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";
  await sendBookingEmail({
    type: "customer_booking_submitted",
    to: data.email,
    artistId: booking.artist_id,
    vars: {
      customer_handle: data.instagram_handle,
      artist_name: artistProfile?.display_name ?? "",
      artist_slug: artistProfile?.slug ?? "",
      placement: data.placement,
      size: data.size,
      date: data.preferred_date,
      magic_link: `${appUrl}/request/${newToken}`,
    },
  });

  revalidateBookingViews(booking.id);
  redirect(`/request/submitted?id=${booking.id}&edited=1&email=1`);
}

export async function cancelCustomerBookingAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const token = formData.get("_token") as string;
  if (!token) return { error: "Invalid link." };

  const tokenHash = hashToken(token);
  const { allowed } = await checkPortalRateLimit(tokenHash);
  if (!allowed) return { error: "Too many requests. Please try again later." };

  const { data: booking } = await serviceClient
    .from("booking_requests")
    .select(
      "id, status, created_at, customer_email, artist_id, slot_id, customer_handle, preferred_date, form_data, deposit_payment_intent_id, deposit_paid_at, deposit_amount, deposit_currency",
    )
    .eq("customer_token_hash", tokenHash)
    .single();

  if (!booking) return { error: "This link is no longer valid." };
  if (isExpired(booking.created_at)) return { error: "This link has expired." };

  const guard = canTransition(booking.status, "cancelled");
  if (!guard.ok) return { error: guard.reason };

  // Status-gated conditional UPDATE with a rowcount check (same pattern as the
  // cores in lib/server/bookings.ts). Without the .eq("status", ...) guard a
  // concurrent artist action (approve rotates the token; reject does not)
  // could slip between the read above and this write — the cancel would then
  // proceed on stale state, releasing the slot of an approved booking and
  // emailing the artist about a cancellation that never happened.
  const cancelledAt = new Date().toISOString();
  const { data: cancelled, error: updateError } = await serviceClient
    .from("booking_requests")
    .update({ status: "cancelled", updated_at: cancelledAt })
    .eq("id", booking.id)
    .eq("customer_token_hash", tokenHash)
    .eq("status", booking.status)
    .select("id");

  if (updateError) return { error: "Something went wrong. Try again." };
  if (!cancelled || cancelled.length === 0) {
    return { error: "This booking just changed. Refresh and try again." };
  }

  if (booking.slot_id) {
    const { error: slotError } = await serviceClient
      .from("slots")
      .update({ status: "open" })
      .eq("id", booking.slot_id)
      .eq("artist_id", booking.artist_id);

    if (slotError) {
      await serviceClient
        .from("booking_requests")
        .update({
          status: booking.status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", booking.id);
      return { error: "The slot could not be released. Please try again." };
    }
  }

  await serviceClient.from("audit_log").insert({
    booking_id: booking.id,
    action: "customer_cancelled",
    details: { from: booking.status, to: "cancelled", by: "customer" },
  });

  // D-f (P0-2) — deposit direction on a CLIENT cancellation:
  //  • a live unpaid card intent is cancelled, so the client can't pay by card
  //    after they've already cancelled (an orphaned charge for a dead booking).
  //  • a deposit that was already paid is FORFEITED — the artist keeps it. We
  //    do NOT refund on a client cancellation; we only record the forfeiture so
  //    the artist surface can show it. (Enforceability = counsel Q9.)
  if (booking.deposit_paid_at) {
    await serviceClient.from("audit_log").insert({
      booking_id: booking.id,
      action: "deposit_forfeited",
      details: {
        by: "customer",
        amount: booking.deposit_amount ? Number(booking.deposit_amount) : null,
        currency: booking.deposit_currency ?? "eur",
        payment_intent_id: booking.deposit_payment_intent_id ?? null,
      },
    });
  } else if (stripe && booking.deposit_payment_intent_id) {
    try {
      await stripe.paymentIntents.cancel(booking.deposit_payment_intent_id);
    } catch {
      // Already paid/cancelled in a race → the webhook idempotency + the
      // forfeiture branch above (on a later view) cover it. Best-effort.
    }
  }

  const { data: artistAuth } = await serviceClient.auth.admin.getUserById(
    booking.artist_id,
  );
  if (artistAuth?.user?.email) {
    const fd = booking.form_data as Record<string, string> | null;
    await sendArtistCancellationByCustomer({
      artistEmail: artistAuth.user.email,
      customerHandle: customerLabel(
        booking.customer_handle,
        booking.customer_email,
        "A client",
      ),
      placement: fd?.placement ?? "",
      date: booking.preferred_date ?? "",
    });
  }

  const fd = booking.form_data as Record<string, string> | null;
  const notificationResult = await createNotification({
    artistId: booking.artist_id,
    type: "booking_cancelled_by_client",
    category: "client_update",
    priority: "high",
    title: "Booking cancelled by client",
    message: `${customerLabel(booking.customer_handle, booking.customer_email, "A client")} cancelled their ${fd?.placement ?? "booking"}${booking.preferred_date ? ` on ${booking.preferred_date}` : ""}.`,
    ctaLabel: "View request",
    ctaHref: `/bookings/requests/${booking.id}`,
    metadata: { booking_id: booking.id },
  });
  if (!notificationResult.ok) {
    console.error("[customer-cancel] notification failed", {
      artistId: booking.artist_id,
      bookingId: booking.id,
      error: notificationResult.error,
    });
  }

  // Drop the cancelled booking out of the artist's calendar + overview.
  revalidateBookingViews(booking.id);
  redirect(
    `/request/submitted?id=${booking.id}&cancelled=1&email=${booking.customer_email ? "1" : "0"}`,
  );
}

// Slice 74 — pre-checkout add-ons. Called from the portal right before the
// customer confirms payment. Recomputes the authoritative total server-side,
// (re)creates the pending order + items, and syncs the existing deposit
// PaymentIntent's amount + metadata so confirmPayment charges exactly the
// current selection. Passing an empty selection resets it to deposit-only.
type PrepareResult = { ok: true; totalEur: number } | { error: string };

export async function prepareCheckoutAction(
  token: string,
  selectionsJson: string,
): Promise<PrepareResult> {
  if (!token) return { error: "Invalid link." };
  const tokenHash = hashToken(token);
  const { allowed } = await checkPortalRateLimit(tokenHash);
  if (!allowed) return { error: "Too many requests. Please try again later." };

  const { data: booking } = await serviceClient
    .from("booking_requests")
    .select(
      "id, status, created_at, deposit_amount, deposit_currency, deposit_payment_intent_id, artist_id, customer_email",
    )
    .eq("customer_token_hash", tokenHash)
    .single();

  if (!booking) return { error: "This link is no longer valid." };
  if (isExpired(booking.created_at)) return { error: "This link has expired." };
  if (booking.status !== "deposit_pending") {
    return { error: "This booking is not awaiting a deposit." };
  }

  const depositAmount = booking.deposit_amount
    ? Number(booking.deposit_amount)
    : null;
  if (!depositAmount || depositAmount <= 0) {
    return { error: "No deposit is set for this booking." };
  }
  if (!stripe || !booking.deposit_payment_intent_id) {
    return { error: "Payment isn’t available for this booking yet." };
  }
  const intentId = booking.deposit_payment_intent_id;
  const baseMeta = { booking_id: booking.id, artist_id: booking.artist_id };

  let selections: AddonSelection[] = [];
  try {
    const arr = JSON.parse(selectionsJson);
    if (Array.isArray(arr)) {
      selections = arr
        .filter(
          (s): s is Record<string, unknown> => !!s && typeof s === "object",
        )
        .map((s) => ({
          productId: String(s.productId ?? ""),
          variantId: s.variantId ? String(s.variantId) : null,
          quantity: Number(s.quantity ?? 0),
        }))
        .filter((s) => s.productId && s.quantity > 0);
    }
  } catch {
    return { error: "Could not read your selection. Try again." };
  }

  // No goods selected → reset the intent to the deposit-only amount and drop the
  // order, so the deposit-only webhook path runs.
  if (selections.length === 0) {
    await serviceClient
      .from("orders")
      .delete()
      .eq("booking_id", booking.id)
      .eq("status", "pending");
    try {
      await stripe.paymentIntents.update(intentId, {
        amount: Math.round(depositAmount * 100),
        metadata: { ...baseMeta, order_id: "" },
      });
    } catch {
      return { error: "Could not prepare the payment. Try again." };
    }
    return { ok: true, totalEur: depositAmount };
  }

  // Goods are priced in EUR only (getAddonProducts filters to currency='eur'),
  // but the deposit PaymentIntent is created in the artist's settlement currency
  // (Slice 79d / 0044), which may be non-EUR. Summing EUR goods into a non-EUR
  // intent would mis-charge (e.g. a EUR 30 item collected as 30 CZK). Refuse the
  // add-on path unless the deposit is EUR; the client can still pay the deposit
  // alone. This also keeps the order rows' hard-coded currency:"eur" correct.
  const depositCurrency = (
    (booking.deposit_currency as string | null) ?? "eur"
  ).toLowerCase();
  if (depositCurrency !== "eur") {
    return {
      error:
        "Add-on items aren’t available for this booking. You can still pay the deposit on its own.",
    };
  }

  // SECURITY: confirm every selection is actually approved for THIS
  // booking. A crafted payload could otherwise reach into the artist's
  // wider checkout-addon catalogue (the products table is service-role
  // readable here). The allowlist is the set of booking_interests rows the
  // artist confirmed `available` on Accept; we also cap quantity at what
  // the artist vouched for so a hand-crafted oversell can't sneak past the
  // UI stepper.
  const { data: interestRows } = await serviceClient
    .from("booking_interests")
    .select("product_id, variant_id, quantity")
    .eq("booking_id", booking.id)
    .eq("status", "available");
  const confirmedQty = new Map<string, number>();
  for (const r of (interestRows ?? []) as {
    product_id: string | null;
    variant_id: string | null;
    quantity: number;
  }[]) {
    if (!r.product_id) continue;
    const key = `${r.product_id}::${r.variant_id ?? ""}`;
    confirmedQty.set(key, Number(r.quantity));
  }
  for (const s of selections) {
    const key = `${s.productId}::${s.variantId ?? ""}`;
    const cap = confirmedQty.get(key);
    if (cap === undefined) {
      return {
        error:
          "One of the items you picked isn’t approved for this booking. Refresh and try again.",
      };
    }
    if (s.quantity > cap) {
      return {
        error:
          "You can add up to the quantity the artist confirmed for each item.",
      };
    }
  }

  // Strict checkout catalogue + line composition (snapshots, dedup, currency
  // / stock / addon-flag validation). This is the only source that becomes
  // payable order_items lines.
  const products = await getAddonProducts(booking.artist_id);
  const computed = computeAddonLines(products, selections);
  if (!computed.ok) return { error: computed.error };

  const subtotal =
    Math.round((depositAmount + computed.goodsAmount) * 100) / 100;

  // Replace any prior pending order for this booking (idempotent re-prepare).
  await serviceClient
    .from("orders")
    .delete()
    .eq("booking_id", booking.id)
    .eq("status", "pending");

  const { data: order, error: orderErr } = await serviceClient
    .from("orders")
    .insert({
      artist_id: booking.artist_id,
      booking_id: booking.id,
      client_email: booking.customer_email,
      stripe_payment_intent_id: intentId,
      status: "pending",
      deposit_amount: depositAmount,
      goods_amount: computed.goodsAmount,
      subtotal_amount: subtotal,
      currency: "eur",
    })
    .select("id")
    .single();
  if (orderErr || !order)
    return { error: "Could not create the order. Try again." };
  const orderId = order.id as string;

  const itemRows = [
    {
      order_id: orderId,
      type: "deposit",
      title_snapshot: DEPOSIT_LINE_TITLE,
      variant_snapshot: null,
      quantity: 1,
      unit_amount: depositAmount,
      total_amount: depositAmount,
      currency: "eur",
    },
    ...computed.lines.map((l) => ({
      order_id: orderId,
      type: "product",
      product_id: l.productId,
      variant_id: l.variantId,
      title_snapshot: l.titleSnapshot,
      variant_snapshot: l.variantSnapshot,
      quantity: l.quantity,
      unit_amount: l.unitAmount,
      total_amount: l.totalAmount,
      currency: "eur",
    })),
  ];
  const { error: itemsErr } = await serviceClient
    .from("order_items")
    .insert(itemRows);
  if (itemsErr) {
    await serviceClient.from("orders").delete().eq("id", orderId);
    return { error: "Could not save the items. Try again." };
  }

  try {
    await stripe.paymentIntents.update(intentId, {
      amount: Math.round(subtotal * 100),
      metadata: { ...baseMeta, order_id: orderId },
    });
  } catch {
    await serviceClient.from("orders").delete().eq("id", orderId);
    return { error: "Could not prepare the payment. Try again." };
  }

  return { ok: true, totalEur: subtotal };
}
