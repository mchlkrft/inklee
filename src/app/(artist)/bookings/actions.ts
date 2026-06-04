"use server";

import crypto from "crypto";
import { formatSize } from "@/lib/booking-schema";
import type { User } from "@supabase/supabase-js";
import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { revalidateBookingViews } from "@/lib/revalidate-bookings";
import { resolveStudioForBooking } from "@/lib/booking-studio";
import { canTransition } from "@/lib/booking-fsm";
import {
  sendBookingEmail,
  sendWaitlistConversionEmail,
  sendDepositRequestedEmail,
} from "@/lib/email/send-booking-email";
import type { EmailGoodsDecision } from "@/lib/email/booking-templates";
import { stripe } from "@/lib/stripe";
import { getConnectRoutingForArtist } from "@/lib/stripe-connect";
import { applicationFeeCents } from "@/lib/platform-fee";
import {
  parseDepositPolicy,
  renderDepositPolicyText,
} from "@/lib/deposit-policy";
import type Stripe from "stripe";

type ActionResult = { error: string } | { success: true };

type AuthorisedBooking = {
  status: string;
  artist_id: string;
  customer_email: string | null;
  customer_handle: string | null;
  preferred_date: string | null;
  slot_id: string | null;
  customer_token_hash: string | null;
  decided_at: string | null;
  form_data: Record<string, string> | null;
};

type AuthorisedBookingResult =
  | { error: string }
  | {
      supabase: Awaited<ReturnType<typeof createClient>>;
      user: User;
      booking: AuthorisedBooking;
    };

async function getAuthorisedBooking(
  bookingId: string,
): Promise<AuthorisedBookingResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated." };

  const { data: booking } = await supabase
    .from("booking_requests")
    .select(
      "status, artist_id, customer_email, customer_handle, preferred_date, slot_id, customer_token_hash, decided_at, form_data",
    )
    .eq("id", bookingId)
    .single();

  if (!booking) return { error: "Booking not found." };
  if (booking.artist_id !== user.id) return { error: "Not authorised." };

  return {
    supabase,
    user,
    booking: {
      status: String(booking.status),
      artist_id: String(booking.artist_id),
      customer_email: booking.customer_email,
      customer_handle: booking.customer_handle,
      preferred_date: booking.preferred_date,
      slot_id: booking.slot_id,
      customer_token_hash: booking.customer_token_hash,
      decided_at: booking.decided_at,
      form_data: booking.form_data as Record<string, string> | null,
    },
  };
}

async function restoreBookingAfterSlotFailure(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bookingId: string,
  booking: AuthorisedBooking,
  extra: Partial<Pick<AuthorisedBooking, "customer_token_hash">> & {
    deposit_paid_at?: string | null;
  } = {},
): Promise<void> {
  await supabase
    .from("booking_requests")
    .update({
      status: booking.status,
      updated_at: new Date().toISOString(),
      decided_at: booking.decided_at,
      customer_token_hash:
        extra.customer_token_hash ?? booking.customer_token_hash,
      ...(extra.deposit_paid_at !== undefined
        ? { deposit_paid_at: extra.deposit_paid_at }
        : {}),
    })
    .eq("id", bookingId);
}

export async function approveBooking(id: string): Promise<ActionResult> {
  const authorised = await getAuthorisedBooking(id);
  if ("error" in authorised) return authorised;

  const { supabase, user, booking } = authorised;
  const guard = canTransition(booking.status, "approved");
  if (!guard.ok) return { error: guard.reason };

  const newToken = booking.customer_email
    ? crypto.randomBytes(32).toString("hex")
    : null;
  const newHash = newToken
    ? crypto.createHash("sha256").update(newToken).digest("hex")
    : null;
  const decidedAt = new Date().toISOString();

  const { error } = await supabase
    .from("booking_requests")
    .update({
      status: "approved",
      updated_at: decidedAt,
      decided_at: decidedAt,
      customer_token_hash: newHash,
    })
    .eq("id", id);

  if (error) {
    Sentry.captureException(error, {
      tags: { action: "booking_status_change" },
    });
    return { error: error.message };
  }

  if (booking.slot_id) {
    const { error: slotError } = await supabase
      .from("slots")
      .update({ status: "booked" })
      .eq("id", booking.slot_id);

    if (slotError) {
      await restoreBookingAfterSlotFailure(supabase, id, booking);
      return { error: "The slot could not be confirmed. Please try again." };
    }
  }

  await supabase.from("audit_log").insert({
    booking_id: id,
    action: "status_changed",
    actor: user.id,
    details: { from: booking.status, to: "approved" },
  });

  if (booking.customer_email && newToken) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";
    const studio = await resolveStudioForBooking(id);
    await sendBookingEmail({
      type: "customer_booking_approved",
      to: booking.customer_email,
      artistId: user.id,
      vars: {
        customer_handle: booking.customer_handle ?? "",
        artist_name: profile?.display_name ?? "",
        placement: booking.form_data?.placement ?? "",
        size: formatSize(booking.form_data?.size),
        date: booking.preferred_date ?? "",
        magic_link: `${appUrl}/request/${newToken}`,
      },
      studio,
    });
  }

  revalidateBookingViews(id);
  return { success: true };
}

// Per-item availability decision from the Accept popup. `interestId` is the
// id of the booking_interests row; `declineNote` is only used when
// `available === false` (capped at 300 chars on the server).
export type InterestDecisionPayload = {
  interestId: string;
  available: boolean;
  declineNote: string | null;
};

// Same effect as approveBooking, plus applies the artist's per-item
// availability decisions to booking_interests and surfaces them in the
// approval email. Used by the Accept popup whenever the booking has pending
// interests; approveBooking still handles the no-interests path.
export async function approveBookingWithInterestDecisions(
  id: string,
  decisions: InterestDecisionPayload[],
): Promise<ActionResult> {
  const authorised = await getAuthorisedBooking(id);
  if ("error" in authorised) return authorised;

  const { supabase, user, booking } = authorised;
  const guard = canTransition(booking.status, "approved");
  if (!guard.ok) return { error: guard.reason };

  // Pull all interests for this booking once so the per-decision update is
  // validated against existing rows and the email surface is built from the
  // snapshot fields (title/variant/qty stay accurate even if the product was
  // later edited).
  const { data: existingInterests, error: interestsFetchError } = await supabase
    .from("booking_interests")
    .select("id, title_snapshot, variant_snapshot, quantity, status")
    .eq("booking_id", id)
    .eq("artist_id", user.id);
  if (interestsFetchError) {
    return { error: interestsFetchError.message };
  }
  const byId = new Map((existingInterests ?? []).map((r) => [String(r.id), r]));

  const updatedAt = new Date().toISOString();
  for (const d of decisions) {
    const row = byId.get(d.interestId);
    // App-level guard: drop the obviously-stale entries early.
    if (!row || row.status !== "pending") continue;
    const note =
      !d.available && d.declineNote
        ? d.declineNote.trim().slice(0, 300) || null
        : null;
    // SQL-level guard: `.eq("status", "pending")` makes the update itself
    // idempotent against a concurrent decision that beat us between the
    // SELECT above and this UPDATE. If status flipped first the row count
    // is 0 and we silently keep the earlier decision.
    const { error: updateError } = await supabase
      .from("booking_interests")
      .update({
        status: d.available ? "available" : "unavailable",
        decline_note: note,
        updated_at: updatedAt,
      })
      .eq("id", d.interestId)
      .eq("artist_id", user.id)
      .eq("status", "pending");
    if (updateError) {
      Sentry.captureException(updateError, {
        tags: { action: "booking_interest_decision" },
        extra: { bookingId: id, interestId: d.interestId },
      });
    }
  }

  const newToken = booking.customer_email
    ? crypto.randomBytes(32).toString("hex")
    : null;
  const newHash = newToken
    ? crypto.createHash("sha256").update(newToken).digest("hex")
    : null;
  const decidedAt = new Date().toISOString();

  const { error } = await supabase
    .from("booking_requests")
    .update({
      status: "approved",
      updated_at: decidedAt,
      decided_at: decidedAt,
      customer_token_hash: newHash,
    })
    .eq("id", id);

  if (error) {
    Sentry.captureException(error, {
      tags: { action: "booking_status_change" },
    });
    return { error: error.message };
  }

  if (booking.slot_id) {
    const { error: slotError } = await supabase
      .from("slots")
      .update({ status: "booked" })
      .eq("id", booking.slot_id);

    if (slotError) {
      await restoreBookingAfterSlotFailure(supabase, id, booking);
      return { error: "The slot could not be confirmed. Please try again." };
    }
  }

  await supabase.from("audit_log").insert({
    booking_id: id,
    action: "status_changed",
    actor: user.id,
    details: {
      from: booking.status,
      to: "approved",
      interest_decisions: decisions.length,
    },
  });

  if (booking.customer_email && newToken) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";
    const studio = await resolveStudioForBooking(id);

    const goodsDecisions: EmailGoodsDecision[] = decisions
      .map((d): EmailGoodsDecision | null => {
        const row = byId.get(d.interestId);
        if (!row) return null;
        const note =
          !d.available && d.declineNote
            ? d.declineNote.trim().slice(0, 300) || null
            : null;
        return {
          title: String(row.title_snapshot ?? ""),
          variant: (row.variant_snapshot as string | null) ?? null,
          quantity: Number(row.quantity ?? 1),
          available: d.available,
          declineNote: note,
        };
      })
      .filter((g): g is EmailGoodsDecision => g !== null);

    await sendBookingEmail({
      type: "customer_booking_approved",
      to: booking.customer_email,
      artistId: user.id,
      vars: {
        customer_handle: booking.customer_handle ?? "",
        artist_name: profile?.display_name ?? "",
        placement: booking.form_data?.placement ?? "",
        size: formatSize(booking.form_data?.size),
        date: booking.preferred_date ?? "",
        magic_link: `${appUrl}/request/${newToken}`,
      },
      studio,
      goodsDecisions: goodsDecisions.length > 0 ? goodsDecisions : null,
    });
  }

  revalidateBookingViews(id);
  return { success: true };
}

// Applies per-interest availability decisions WITHOUT transitioning the
// booking — used by the Accept popup when the artist's next step is "Request
// deposit" instead of immediate approval, so the decisions land before the
// deposit form opens. Same ownership + per-row guard as
// approveBookingWithInterestDecisions; if you're going straight to approved,
// call that one instead.
export async function applyInterestDecisions(
  id: string,
  decisions: InterestDecisionPayload[],
): Promise<ActionResult> {
  const authorised = await getAuthorisedBooking(id);
  if ("error" in authorised) return authorised;

  const { supabase, user } = authorised;

  const { data: existingInterests, error: interestsFetchError } = await supabase
    .from("booking_interests")
    .select("id, status")
    .eq("booking_id", id)
    .eq("artist_id", user.id);
  if (interestsFetchError) {
    return { error: interestsFetchError.message };
  }
  const byId = new Map((existingInterests ?? []).map((r) => [String(r.id), r]));

  const updatedAt = new Date().toISOString();
  for (const d of decisions) {
    const row = byId.get(d.interestId);
    // Same guard as the approve path — silently skip rows that aren't this
    // booking's, or aren't still pending (could have been decided already).
    if (!row || row.status !== "pending") continue;
    const note =
      !d.available && d.declineNote
        ? d.declineNote.trim().slice(0, 300) || null
        : null;
    // SQL-level guard mirrors the approve path: `.eq("status", "pending")`
    // makes a double-click or concurrent decision a 0-row update instead of
    // an overwrite of an already-decided row.
    const { error: updateError } = await supabase
      .from("booking_interests")
      .update({
        status: d.available ? "available" : "unavailable",
        decline_note: note,
        updated_at: updatedAt,
      })
      .eq("id", d.interestId)
      .eq("artist_id", user.id)
      .eq("status", "pending");
    if (updateError) {
      Sentry.captureException(updateError, {
        tags: { action: "booking_interest_decision_no_approve" },
        extra: { bookingId: id, interestId: d.interestId },
      });
    }
  }

  revalidateBookingViews(id);
  return { success: true };
}

export async function rejectBooking(id: string): Promise<ActionResult> {
  const authorised = await getAuthorisedBooking(id);
  if ("error" in authorised) return authorised;

  const { supabase, user, booking } = authorised;
  const guard = canTransition(booking.status, "rejected");
  if (!guard.ok) return { error: guard.reason };

  const decidedAt = new Date().toISOString();
  const { error } = await supabase
    .from("booking_requests")
    .update({
      status: "rejected",
      updated_at: decidedAt,
      decided_at: decidedAt,
    })
    .eq("id", id);

  if (error) {
    Sentry.captureException(error, {
      tags: { action: "booking_status_change" },
    });
    return { error: error.message };
  }

  if (booking.slot_id) {
    const { error: slotError } = await supabase
      .from("slots")
      .update({ status: "open" })
      .eq("id", booking.slot_id);

    if (slotError) {
      await restoreBookingAfterSlotFailure(supabase, id, booking);
      return { error: "The slot could not be released. Please try again." };
    }
  }

  await supabase.from("audit_log").insert({
    booking_id: id,
    action: "status_changed",
    actor: user.id,
    details: { from: booking.status, to: "rejected" },
  });

  if (booking.customer_email) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();
    await sendBookingEmail({
      type: "customer_booking_rejected",
      to: booking.customer_email,
      artistId: user.id,
      vars: {
        customer_handle: booking.customer_handle ?? "",
        artist_name: profile?.display_name ?? "",
      },
    });
  }

  revalidateBookingViews(id);
  return { success: true };
}

// Notify the customer that a deposit was requested, with a fresh payment link.
// Rotates the magic-link token (only the hash is stored, so the old link can't
// be reused) — same pattern as approveBooking. Best-effort: never blocks the
// deposit request itself.
async function notifyDepositRequested(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bookingId: string,
  artistId: string,
  booking: AuthorisedBooking,
  amount: number,
  dueAt: string,
  note: string | null,
): Promise<void> {
  if (!booking.customer_email) return;

  const newToken = crypto.randomBytes(32).toString("hex");
  const newHash = crypto.createHash("sha256").update(newToken).digest("hex");
  const { error: rotateError } = await supabase
    .from("booking_requests")
    .update({
      customer_token_hash: newHash,
      updated_at: new Date().toISOString(),
    })
    .eq("id", bookingId);
  if (rotateError) return;

  await supabase.from("audit_log").insert({
    booking_id: bookingId,
    action: "token_rotated",
    actor: artistId,
    details: {
      old_hash: booking.customer_token_hash,
      new_hash: newHash,
      by: "deposit_request",
    },
  });

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", artistId)
    .single();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";

  await sendDepositRequestedEmail({
    to: booking.customer_email,
    artistName: profile?.display_name ?? "the artist",
    customerHandle: booking.customer_handle ?? "",
    amountEur: amount,
    dueDate: dueAt,
    depositNote: note,
    magicLink: `${appUrl}/request/${newToken}`,
  });
}

export async function requestDeposit(
  id: string,
  amount: number,
  dueAt: string,
  note: string | null,
): Promise<ActionResult> {
  const authorised = await getAuthorisedBooking(id);
  if ("error" in authorised) return authorised;

  const { supabase, user, booking } = authorised;
  const guard = canTransition(booking.status, "deposit_pending");
  if (!guard.ok) return { error: guard.reason };

  // Q9: snapshot the artist's current deposit policy onto the booking now, so
  // later edits to the policy never change what this client agreed to. Used by
  // the client-facing disclosure, the confirmation email, and the portal.
  const { data: policyProfile } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", user.id)
    .single();
  const depositPolicy = parseDepositPolicy(
    (policyProfile?.settings as Record<string, unknown> | null)?.deposit_policy,
  );
  const depositPolicySnapshot = renderDepositPolicyText(depositPolicy);

  const decidedAt = new Date().toISOString();
  const { data: fresh } = await supabase
    .from("booking_requests")
    .select("deposit_payment_intent_id, deposit_client_secret")
    .eq("id", id)
    .single();

  if (fresh?.deposit_payment_intent_id && fresh?.deposit_client_secret) {
    // F5 (RS-3): keep the live PaymentIntent's amount in step with the
    // re-requested deposit. Previously the DB amount was updated here but the
    // intent was not — only the goods `prepareCheckoutAction` rewrote it right
    // before charging. Now that the deposit-only portal pays the intent
    // directly (no prepare step), a stale intent would charge the OLD amount
    // and the webhook's amount check would 409 the payment. We also reset the
    // metadata to deposit-only (clearing any prior `order_id`) since goods are
    // parked. Best-effort: a transient Stripe failure shouldn't block the
    // re-request — the amount check is the backstop.
    if (stripe && amount > 0) {
      try {
        await stripe.paymentIntents.update(fresh.deposit_payment_intent_id, {
          amount: Math.round(amount * 100),
          // RS-4: keep the platform fee in step with the re-requested amount.
          // application_fee_amount = what Inklee KEEPS (3% all-in minus the
          // Stripe fee Inklee absorbs); customer still pays exactly `amount`.
          application_fee_amount: applicationFeeCents(Math.round(amount * 100)),
          metadata: { booking_id: id, artist_id: user.id },
        });
      } catch (stripeErr) {
        Sentry.captureException(stripeErr, {
          tags: { action: "stripe_update_intent" },
          extra: { bookingId: id },
        });
      }
    }

    const { error: reuseError } = await supabase
      .from("booking_requests")
      .update({
        deposit_amount: amount,
        deposit_due_at: dueAt,
        deposit_note: note || null,
        deposit_policy: depositPolicy,
        deposit_policy_snapshot: depositPolicySnapshot,
        status: "deposit_pending",
        decided_at: decidedAt,
        updated_at: decidedAt,
      })
      .eq("id", id);
    if (reuseError) return { error: reuseError.message };

    await notifyDepositRequested(
      supabase,
      id,
      user.id,
      booking,
      amount,
      dueAt,
      note,
    );
    revalidateBookingViews(id);
    return { success: true };
  }

  let paymentIntentId: string | null = null;
  let clientSecret: string | null = null;
  let routedToConnect = false;
  if (stripe && amount > 0) {
    // OT-12.2 destination charge routing. When the artist has finished
    // Stripe Connect onboarding (status='active' + charges_enabled), we
    // create the intent with `on_behalf_of` so the customer-facing
    // statement, fee rules, and refund flow look like the charge is on the
    // artist's account, and `transfer_data.destination` so the funds settle
    // into the artist's Stripe balance after the platform leg clears. For
    // un-connected artists we keep the existing platform-account flow
    // (status quo — no breaking change).
    const routing = await getConnectRoutingForArtist(user.id);
    // RS-2 (money-scope reset 2026-06-03): only collect a deposit THROUGH
    // Inklee when the artist has an active Connect account. The charge then
    // rides on the artist's account (destination charge: on_behalf_of +
    // transfer_data), so the artist is merchant of record. Un-connected
    // artists get a MANUAL deposit instead — no PaymentIntent is created, the
    // client is shown the amount + the artist's note (e.g. bank-transfer
    // details) and pays them directly, and the artist marks it received. This
    // removes the prior fallback where an un-connected artist's deposit was
    // charged onto Inklee's OWN platform account, which made Inklee merchant
    // of record / fund-holder for money it had no business holding.
    if (routing.routeCharges && routing.stripeAccountId) {
      const intentParams: Stripe.PaymentIntentCreateParams = {
        amount: Math.round(amount * 100),
        currency: "eur",
        // Omit payment_method_types; this keeps dynamic payment methods on
        // explicitly + version-independently (Stripe best practice).
        automatic_payment_methods: { enabled: true },
        metadata: { booking_id: id, artist_id: user.id },
        description: `Tattoo deposit - booking ${id}`,
        on_behalf_of: routing.stripeAccountId,
        transfer_data: { destination: routing.stripeAccountId },
        // RS-4 platform fee (all-in deducted model). The customer pays
        // `amount`; `application_fee_amount` is what Inklee KEEPS after
        // absorbing Stripe's standard processing fee out of the 3% (see
        // platform-fee.ts). `on_behalf_of` stays set so the artist is merchant
        // of record (LO-2) and Stripe debits its fee from the artist's
        // account; the application fee is sized so the artist's all-in loss is
        // ~3% on a standard EU card. Manual (un-connected) deposits never reach
        // this branch and carry no fee.
        application_fee_amount: applicationFeeCents(Math.round(amount * 100)),
      };
      try {
        const intent = await stripe.paymentIntents.create(
          intentParams,
          // One intent per booking even under rapid re-submits / retries.
          { idempotencyKey: `deposit-intent-${id}` },
        );
        paymentIntentId = intent.id;
        clientSecret = intent.client_secret;
        routedToConnect = true;
      } catch (stripeErr) {
        Sentry.captureException(stripeErr, {
          tags: { action: "stripe_create_intent" },
        });
      }
    }
  }

  const { error } = await supabase
    .from("booking_requests")
    .update({
      status: "deposit_pending",
      deposit_amount: amount,
      deposit_due_at: dueAt,
      deposit_note: note || null,
      deposit_policy: depositPolicy,
      deposit_policy_snapshot: depositPolicySnapshot,
      deposit_payment_intent_id: paymentIntentId,
      deposit_client_secret: clientSecret,
      decided_at: decidedAt,
      updated_at: decidedAt,
    })
    .eq("id", id);

  if (error) {
    Sentry.captureException(error, {
      tags: { action: "booking_status_change" },
    });
    return { error: error.message };
  }

  await supabase.from("audit_log").insert({
    booking_id: id,
    action: "status_changed",
    actor: user.id,
    details: {
      from: booking.status,
      to: "deposit_pending",
      amount,
      due_at: dueAt,
      stripe: !!paymentIntentId,
      // OT-12.2: trace whether the intent was Connect-routed. Lets the team
      // diagnose mismatches between expected routing and the actual intent
      // shape without re-querying Stripe.
      stripe_connect_routed: routedToConnect,
    },
  });

  await notifyDepositRequested(
    supabase,
    id,
    user.id,
    booking,
    amount,
    dueAt,
    note,
  );
  revalidateBookingViews(id);
  return { success: true };
}

export async function markDepositReceived(id: string): Promise<ActionResult> {
  const authorised = await getAuthorisedBooking(id);
  if ("error" in authorised) return authorised;

  const { supabase, user, booking } = authorised;
  const guard = canTransition(booking.status, "approved");
  if (!guard.ok) return { error: guard.reason };

  // F7: if this deposit was set up for in-app card payment, an unpaid
  // PaymentIntent is still outstanding. Marking it received manually (client
  // paid another way) must cancel that intent, otherwise the client could
  // still pay by card afterwards and be charged for a booking that's already
  // confirmed. Best-effort — a succeeded/already-cancelled intent just throws
  // and is ignored (the webhook idempotency handles a genuine race).
  const { data: depo } = await supabase
    .from("booking_requests")
    .select("deposit_payment_intent_id")
    .eq("id", id)
    .single();
  if (stripe && depo?.deposit_payment_intent_id) {
    try {
      await stripe.paymentIntents.cancel(depo.deposit_payment_intent_id);
    } catch (cancelErr) {
      Sentry.captureException(cancelErr, {
        tags: { action: "stripe_cancel_intent_on_manual_mark" },
        extra: { bookingId: id },
      });
    }
  }

  const decidedAt = new Date().toISOString();
  const { error } = await supabase
    .from("booking_requests")
    .update({
      status: "approved",
      updated_at: decidedAt,
      decided_at: booking.decided_at ?? decidedAt,
      deposit_paid_at: decidedAt,
    })
    .eq("id", id);

  if (error) {
    Sentry.captureException(error, {
      tags: { action: "booking_status_change" },
    });
    return { error: error.message };
  }

  if (booking.slot_id) {
    const { error: slotError } = await supabase
      .from("slots")
      .update({ status: "booked" })
      .eq("id", booking.slot_id);

    if (slotError) {
      await restoreBookingAfterSlotFailure(supabase, id, booking, {
        deposit_paid_at: null,
      });
      return { error: "The slot could not be confirmed. Please try again." };
    }
  }

  await supabase.from("audit_log").insert({
    booking_id: id,
    action: "status_changed",
    actor: user.id,
    details: { from: booking.status, to: "approved", via: "deposit_received" },
  });

  revalidateBookingViews(id);
  return { success: true };
}

// RS-6: refund a paid in-app card deposit. Full refund only (the common
// deposit case — cancel → return it). Money mechanics (destination charge):
//   • reverse_transfer       → pull the refunded amount back from the artist's
//                              connected account (they hold it as merchant of
//                              record).
//   • refund_application_fee → return Inklee's platform fee too; Inklee does
//                              not profit on a refunded deposit.
// Stripe's own processing fee is non-refundable and stays with the artist —
// identical to the artist refunding from their own Stripe dashboard. Manual
// deposits (no PaymentIntent) can't be refunded here; the artist returns the
// money the same way they collected it.
export async function refundDeposit(id: string): Promise<ActionResult> {
  const authorised = await getAuthorisedBooking(id);
  if ("error" in authorised) return authorised;

  const { supabase, user } = authorised;

  const { data: fresh } = await supabase
    .from("booking_requests")
    .select("deposit_payment_intent_id, deposit_paid_at, deposit_amount")
    .eq("id", id)
    .single();

  if (!fresh?.deposit_payment_intent_id || !fresh?.deposit_paid_at) {
    return {
      error: "There's no paid card deposit to refund for this booking.",
    };
  }

  // Idempotency guard: bail if a refund is already logged for this booking.
  // The Stripe idempotency key below is the real safety net against a race;
  // this just gives a clean message on a second click.
  const { count: alreadyRefunded } = await supabase
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", id)
    .eq("action", "deposit_refunded");
  if ((alreadyRefunded ?? 0) > 0) {
    return { error: "This deposit has already been refunded." };
  }

  if (!stripe) {
    return { error: "Refunds aren’t available on this deployment." };
  }

  let refundId: string;
  try {
    const refund = await stripe.refunds.create(
      {
        payment_intent: fresh.deposit_payment_intent_id,
        reverse_transfer: true,
        refund_application_fee: true,
      },
      { idempotencyKey: `refund-deposit-${id}` },
    );
    refundId = refund.id;
  } catch (stripeErr) {
    Sentry.captureException(stripeErr, {
      tags: { action: "stripe_refund_deposit" },
      extra: { bookingId: id },
    });
    return {
      error:
        "Stripe couldn’t process the refund. Try again, or refund from your Stripe dashboard.",
    };
  }

  await supabase.from("audit_log").insert({
    booking_id: id,
    action: "deposit_refunded",
    actor: user.id,
    details: {
      refund_id: refundId,
      amount_eur: fresh.deposit_amount ? Number(fresh.deposit_amount) : null,
      payment_intent_id: fresh.deposit_payment_intent_id,
    },
  });

  revalidateBookingViews(id);
  return { success: true };
}

export async function markWaitlistContacted(
  entryId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase
    .from("waitlist_entries")
    .update({ status: "contacted" })
    .eq("id", entryId)
    .eq("artist_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/bookings/overview");
  return { success: true };
}

// Slice 75 — mark a paid order's goods as collected at the appointment.
export async function markGoodsPickedUp(
  orderId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: order } = await supabase
    .from("orders")
    .select("id, booking_id, status")
    .eq("id", orderId)
    .eq("artist_id", user.id)
    .single();
  if (!order) return { error: "Order not found." };
  if (order.status !== "paid") {
    return { error: "Only paid orders can be marked picked up." };
  }

  const { error } = await supabase
    .from("orders")
    .update({
      fulfillment_status: "picked_up",
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("artist_id", user.id);
  if (error) return { error: error.message };

  revalidatePath(`/bookings/requests/${order.booking_id}`);
  return { success: true };
}

export async function dismissWaitlistEntry(
  entryId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase
    .from("waitlist_entries")
    .update({ status: "dismissed" })
    .eq("id", entryId)
    .eq("artist_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/bookings/overview");
  return { success: true };
}

export async function convertWaitlistEntry({
  entryId,
  customerEmail,
  customerHandle,
  note,
}: {
  entryId: string;
  customerEmail: string;
  customerHandle: string;
  note: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const decidedAt = new Date().toISOString();

  const { error } = await supabase.from("booking_requests").insert({
    artist_id: user.id,
    status: "approved",
    origin: "artist_created",
    customer_email: customerEmail,
    customer_handle: customerHandle,
    customer_token_hash: tokenHash,
    // Mark the waitlist origin in form_data (no enum migration needed) so the
    // requests list can flag it with a "Waitlist" chip (78c/DT-5).
    form_data: { description: note || "", source: "waitlist" },
    decided_at: decidedAt,
    updated_at: decidedAt,
  });

  if (error) {
    Sentry.captureException(error, { tags: { action: "waitlist_convert" } });
    return { error: error.message };
  }

  await supabase
    .from("waitlist_entries")
    .update({ status: "converted" })
    .eq("id", entryId);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";
  await sendWaitlistConversionEmail({
    to: customerEmail,
    artistName: profile?.display_name ?? "",
    magicLink: `${appUrl}/request/${token}`,
    customerHandle,
  });

  revalidateBookingViews();
  return { success: true };
}
