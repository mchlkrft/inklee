// Money-path / status-change booking logic, extracted from the web Server
// Actions (`src/app/(artist)/bookings/actions.ts`) so the web app and the mobile
// JSON API (`/api/mobile/*`) share ONE implementation of the Stripe + entitlement
// flow — no divergence on the money path. These functions take an already-
// authenticated, RLS-scoped Supabase client + the artist's user id; they perform
// NO auth and NO Next.js cache revalidation. The callers own those:
//   • web Server Actions → cookie client + `revalidateBookingViews()`
//   • mobile route handlers → Bearer-JWT client (no web revalidate needed)
//
// Keep this file free of "use server" and of `next/cache` / `next/headers`
// imports so it stays importable from both surfaces.

import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as Sentry from "@sentry/nextjs";
import { formatSize } from "@/lib/booking-schema";
import { resolveStudioForBooking } from "@/lib/booking-studio";
import { canTransition } from "@/lib/booking-fsm";
import { isDateKey, isDateKeyBefore, localDateKey } from "@/lib/date-utils";
import {
  sendBookingEmail,
  sendDepositRequestedEmail,
} from "@/lib/email/send-booking-email";
import type { EmailGoodsDecision } from "@/lib/email/booking-templates";
import { stripe } from "@/lib/stripe";
import { getConnectRoutingForArtist } from "@/lib/stripe-connect";
import { artistDepositCurrency } from "@/lib/connect-countries";
import { platformFeeCents } from "@/lib/platform-fee";
import { checkDepositRequestRateLimit } from "@/lib/ratelimit";
import { canAccess, isFeeSponsorshipActive } from "@/lib/entitlements";
import { getAccountOverrides } from "@/lib/entitlements-server";
import {
  parseDepositPolicy,
  renderDepositPolicyText,
} from "@/lib/deposit-policy";
import type Stripe from "stripe";

export type BookingMutationResult = { error: string } | { success: true };

export type AuthorisedBooking = {
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

// Per-item availability decision from the Accept popup. `interestId` is the
// id of the booking_interests row; `declineNote` is only used when
// `available === false` (capped at 300 chars on the server).
export type InterestDecisionPayload = {
  interestId: string;
  available: boolean;
  declineNote: string | null;
};

type AuthorisedBookingResult =
  | { error: string }
  | { booking: AuthorisedBooking };

// Fetch the booking and assert the caller owns it. Auth (resolving `userId`)
// is the caller's job — by the time we're here the client is already scoped to
// the signed-in artist, so this is a belt-and-braces ownership check on top of
// RLS.
async function getAuthorisedBooking(
  supabase: SupabaseClient,
  userId: string,
  bookingId: string,
): Promise<AuthorisedBookingResult> {
  const { data: booking } = await supabase
    .from("booking_requests")
    .select(
      "status, artist_id, customer_email, customer_handle, preferred_date, slot_id, customer_token_hash, decided_at, form_data",
    )
    .eq("id", bookingId)
    .single();

  if (!booking) return { error: "Booking not found." };
  if (booking.artist_id !== userId) return { error: "Not authorised." };

  return {
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
  supabase: SupabaseClient,
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

// When a deposit_pending booking is approved DIRECTLY (artist hits Accept
// instead of "deposit received"), any outstanding in-app card PaymentIntent must
// be cancelled — otherwise the client could still pay from an already-open
// payment page for a booking that's now approved, and the webhook would swallow
// that payment as a replay (money captured, no record). Mirrors
// markDepositReceivedCore's F7 handling. Best-effort; only touches an UNPAID
// intent (a paid one means the webhook already moved the booking to approved).
async function cancelLiveDepositIntentOnApprove(
  supabase: SupabaseClient,
  id: string,
  priorStatus: string,
): Promise<void> {
  if (priorStatus !== "deposit_pending" || !stripe) return;
  const { data: depo } = await supabase
    .from("booking_requests")
    .select("deposit_payment_intent_id, deposit_paid_at")
    .eq("id", id)
    .single();
  if (depo?.deposit_payment_intent_id && !depo?.deposit_paid_at) {
    try {
      await stripe.paymentIntents.cancel(depo.deposit_payment_intent_id);
    } catch (cancelErr) {
      Sentry.captureException(cancelErr, {
        tags: { action: "stripe_cancel_intent_on_approve" },
        extra: { bookingId: id },
      });
    }
  }
}

export async function approveBookingCore(
  supabase: SupabaseClient,
  userId: string,
  id: string,
): Promise<BookingMutationResult> {
  const authorised = await getAuthorisedBooking(supabase, userId, id);
  if ("error" in authorised) return authorised;

  const { booking } = authorised;
  const guard = canTransition(booking.status, "approved");
  if (!guard.ok) return { error: guard.reason };

  await cancelLiveDepositIntentOnApprove(supabase, id, booking.status);

  const newToken = booking.customer_email
    ? crypto.randomBytes(32).toString("hex")
    : null;
  const newHash = newToken
    ? crypto.createHash("sha256").update(newToken).digest("hex")
    : null;
  const decidedAt = new Date().toISOString();

  // Conditional UPDATE: only flip if the row is still in the status we read, so
  // a concurrent transition (e.g. the deposit webhook) can't be clobbered by a
  // stale last-writer-wins update.
  const { data: approvedRows, error } = await supabase
    .from("booking_requests")
    .update({
      status: "approved",
      updated_at: decidedAt,
      decided_at: decidedAt,
      customer_token_hash: newHash,
    })
    .eq("id", id)
    .eq("status", booking.status)
    .select("id");

  if (error) {
    Sentry.captureException(error, {
      tags: { action: "booking_status_change" },
    });
    return { error: error.message };
  }

  if (!approvedRows || approvedRows.length === 0) {
    return { error: "This booking just changed. Refresh and try again." };
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
    actor: userId,
    details: { from: booking.status, to: "approved" },
  });

  if (booking.customer_email && newToken) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .single();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";
    const studio = await resolveStudioForBooking(id);
    await sendBookingEmail({
      type: "customer_booking_approved",
      to: booking.customer_email,
      artistId: userId,
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

  return { success: true };
}

// Same effect as approveBookingCore, plus applies the artist's per-item
// availability decisions to booking_interests and surfaces them in the
// approval email. Used by the Accept popup whenever the booking has pending
// interests; approveBookingCore still handles the no-interests path.
export async function approveBookingWithInterestDecisionsCore(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  decisions: InterestDecisionPayload[],
): Promise<BookingMutationResult> {
  const authorised = await getAuthorisedBooking(supabase, userId, id);
  if ("error" in authorised) return authorised;

  const { booking } = authorised;
  const guard = canTransition(booking.status, "approved");
  if (!guard.ok) return { error: guard.reason };

  await cancelLiveDepositIntentOnApprove(supabase, id, booking.status);

  // Pull all interests for this booking once so the per-decision update is
  // validated against existing rows and the email surface is built from the
  // snapshot fields (title/variant/qty stay accurate even if the product was
  // later edited).
  const { data: existingInterests, error: interestsFetchError } = await supabase
    .from("booking_interests")
    .select("id, title_snapshot, variant_snapshot, quantity, status")
    .eq("booking_id", id)
    .eq("artist_id", userId);
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
      .eq("artist_id", userId)
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

  // Conditional UPDATE: only flip if the row is still in the status we read, so
  // a concurrent transition (e.g. the deposit webhook) can't be clobbered by a
  // stale last-writer-wins update.
  const { data: approvedRows, error } = await supabase
    .from("booking_requests")
    .update({
      status: "approved",
      updated_at: decidedAt,
      decided_at: decidedAt,
      customer_token_hash: newHash,
    })
    .eq("id", id)
    .eq("status", booking.status)
    .select("id");

  if (error) {
    Sentry.captureException(error, {
      tags: { action: "booking_status_change" },
    });
    return { error: error.message };
  }

  if (!approvedRows || approvedRows.length === 0) {
    return { error: "This booking just changed. Refresh and try again." };
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
    actor: userId,
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
      .eq("id", userId)
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
      artistId: userId,
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

  return { success: true };
}

// Applies per-interest availability decisions WITHOUT transitioning the
// booking — used by the Accept popup when the artist's next step is "Request
// deposit" instead of immediate approval, so the decisions land before the
// deposit form opens.
export async function applyInterestDecisionsCore(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  decisions: InterestDecisionPayload[],
): Promise<BookingMutationResult> {
  const authorised = await getAuthorisedBooking(supabase, userId, id);
  if ("error" in authorised) return authorised;

  const { data: existingInterests, error: interestsFetchError } = await supabase
    .from("booking_interests")
    .select("id, status")
    .eq("booking_id", id)
    .eq("artist_id", userId);
  if (interestsFetchError) {
    return { error: interestsFetchError.message };
  }
  const byId = new Map((existingInterests ?? []).map((r) => [String(r.id), r]));

  const updatedAt = new Date().toISOString();
  for (const d of decisions) {
    const row = byId.get(d.interestId);
    if (!row || row.status !== "pending") continue;
    const note =
      !d.available && d.declineNote
        ? d.declineNote.trim().slice(0, 300) || null
        : null;
    const { error: updateError } = await supabase
      .from("booking_interests")
      .update({
        status: d.available ? "available" : "unavailable",
        decline_note: note,
        updated_at: updatedAt,
      })
      .eq("id", d.interestId)
      .eq("artist_id", userId)
      .eq("status", "pending");
    if (updateError) {
      Sentry.captureException(updateError, {
        tags: { action: "booking_interest_decision_no_approve" },
        extra: { bookingId: id, interestId: d.interestId },
      });
    }
  }

  return { success: true };
}

export async function rejectBookingCore(
  supabase: SupabaseClient,
  userId: string,
  id: string,
): Promise<BookingMutationResult> {
  const authorised = await getAuthorisedBooking(supabase, userId, id);
  if ("error" in authorised) return authorised;

  const { booking } = authorised;
  const guard = canTransition(booking.status, "rejected");
  if (!guard.ok) return { error: guard.reason };

  // Deposit handling before rejecting. A deposit_pending booking can carry a
  // live in-app card PaymentIntent; if it isn't cancelled, the client could
  // still pay (from an already-open payment page) for a booking that's been
  // passed — money captured with no record. Mirror markDepositReceivedCore /
  // cancelBookingCore: refuse to reject a PAID deposit (steer the artist to
  // cancel, which refunds), and cancel a live UNPAID intent.
  const { data: depo } = await supabase
    .from("booking_requests")
    .select("deposit_payment_intent_id, deposit_paid_at")
    .eq("id", id)
    .single();
  if (depo?.deposit_paid_at) {
    return {
      error:
        "This booking has a paid deposit. Cancel it instead so the deposit is refunded.",
    };
  }
  if (stripe && depo?.deposit_payment_intent_id) {
    try {
      await stripe.paymentIntents.cancel(depo.deposit_payment_intent_id);
    } catch (cancelErr) {
      Sentry.captureException(cancelErr, {
        tags: { action: "stripe_cancel_intent_on_reject" },
        extra: { bookingId: id },
      });
    }
  }

  const decidedAt = new Date().toISOString();
  // Conditional UPDATE: only reject if the row is still in the status we read
  // AND still has no paid deposit. Closes the TOCTOU window where the deposit
  // webhook flips the booking to approved + sets deposit_paid_at between our
  // re-select above and this write — without the precondition, last-writer-wins
  // would mark a now-paid booking 'rejected' with money captured.
  const { data: updated, error } = await supabase
    .from("booking_requests")
    .update({
      status: "rejected",
      updated_at: decidedAt,
      decided_at: decidedAt,
    })
    .eq("id", id)
    .eq("status", booking.status)
    .is("deposit_paid_at", null)
    .select("id");

  if (error) {
    Sentry.captureException(error, {
      tags: { action: "booking_status_change" },
    });
    return { error: error.message };
  }

  if (!updated || updated.length === 0) {
    return {
      error: "This booking just changed. Refresh and try again.",
    };
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
    actor: userId,
    details: { from: booking.status, to: "rejected" },
  });

  if (booking.customer_email) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .single();
    await sendBookingEmail({
      type: "customer_booking_rejected",
      to: booking.customer_email,
      artistId: userId,
      vars: {
        customer_handle: booking.customer_handle ?? "",
        artist_name: profile?.display_name ?? "",
      },
    });
  }

  return { success: true };
}

// Notify the customer that a deposit was requested, with a fresh payment link.
// Rotates the magic-link token (only the hash is stored, so the old link can't
// be reused). Best-effort: never blocks the deposit request itself.
async function notifyDepositRequested(
  supabase: SupabaseClient,
  bookingId: string,
  artistId: string,
  booking: AuthorisedBooking,
  amount: number,
  dueAt: string,
  note: string | null,
  currency: string,
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
    currency,
    dueDate: dueAt,
    depositNote: note,
    magicLink: `${appUrl}/request/${newToken}`,
  });
}

// Upper bound for a single deposit request (any currency). Generous for even a
// large custom piece, but blocks an absurd/typo charge. Mirrors the
// deposit-defaults parser's MAX_AMOUNT (deposit-settings.ts).
const MAX_DEPOSIT_AMOUNT = 100_000;

export async function requestDepositCore(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  amount: number,
  dueAt: string,
  note: string | null,
): Promise<BookingMutationResult> {
  const authorised = await getAuthorisedBooking(supabase, userId, id);
  if ("error" in authorised) return authorised;

  const { booking } = authorised;
  const guard = canTransition(booking.status, "deposit_pending");
  if (!guard.ok) return { error: guard.reason };

  // P2-2: throttle deposit requests (each creates/updates a PaymentIntent).
  const { allowed } = await checkDepositRequestRateLimit(userId);
  if (!allowed) {
    return { error: "Too many deposit requests. Please try again shortly." };
  }

  // P2-5: server-side floor. The UI enforces min=1, but harden here too — a
  // sub-unit amount yields a 0 platform fee (Inklee earns nothing while still
  // paying Stripe's fee) and isn't a meaningful deposit. Currency-neutral.
  if (!Number.isFinite(amount) || amount < 1) {
    return { error: "Deposit amount must be at least 1." };
  }

  // Audit 2026-06-08 (D-M2): cap the amount and reject sub-cent precision. The
  // floor alone let a typo or a compromised session create an absurd
  // PaymentIntent against a real client card; the 2-decimal guard keeps the
  // charged cents (Math.round(amount*100)) equal to the stored deposit_amount.
  if (amount > MAX_DEPOSIT_AMOUNT) {
    return { error: `Deposit amount can't exceed ${MAX_DEPOSIT_AMOUNT}.` };
  }
  if (Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6) {
    return { error: "Deposit amount can't have more than 2 decimal places." };
  }
  // Audit 2026-06-08 (D-L1): validate the due date server-side — the UI checks
  // isDateKey, but the server must not trust the client (a garbage/past date
  // otherwise reaches the client-facing email). Must be YYYY-MM-DD, today+.
  if (!isDateKey(dueAt) || isDateKeyBefore(dueAt, localDateKey())) {
    return { error: "Deposit due date must be a valid date, today or later." };
  }

  // Q9: snapshot the artist's current deposit policy onto the booking now, so
  // later edits to the policy never change what this client agreed to.
  const { data: policyProfile } = await supabase
    .from("profiles")
    .select("settings, stripe_account_country")
    .eq("id", userId)
    .single();
  const depositPolicy = parseDepositPolicy(
    (policyProfile?.settings as Record<string, unknown> | null)?.deposit_policy,
  );
  const depositPolicySnapshot = renderDepositPolicyText(depositPolicy);
  // Slice 79d: charge the deposit in the artist's settlement currency so a
  // non-eurozone artist has no FX at payout.
  const depositCurrency = artistDepositCurrency(
    (policyProfile as { stripe_account_country?: string | null } | null)
      ?.stripe_account_country,
  );

  // Slice 81: in-app card deposits are gated behind the `deposits` entitlement
  // (Solo Plus or an admin comp). Un-entitled artists fall through to a MANUAL
  // deposit (no PaymentIntent). When fee sponsorship is active, Inklee waives
  // the 3% (application_fee 0) and we stamp the foregone fee on the intent so the
  // webhook can track it against the sponsorship budget.
  const overrides = await getAccountOverrides(userId);
  const depositsEntitled = canAccess(overrides, "deposits");
  const feeSponsored = depositsEntitled && isFeeSponsorshipActive(overrides);
  const amountCents = Math.round(amount * 100);
  const standardFeeCents = platformFeeCents(amountCents);
  const appFeeCents = feeSponsored ? 0 : standardFeeCents;
  const depositMetadata: Record<string, string> = feeSponsored
    ? {
        booking_id: id,
        artist_id: userId,
        sponsored_fee_cents: String(standardFeeCents),
      }
    : { booking_id: id, artist_id: userId };

  const decidedAt = new Date().toISOString();
  const { data: fresh } = await supabase
    .from("booking_requests")
    .select("deposit_payment_intent_id, deposit_client_secret")
    .eq("id", id)
    .single();

  if (fresh?.deposit_payment_intent_id && fresh?.deposit_client_secret) {
    // P1-6 / FUN-2/FUN-10: an existing card intent can only be reused if the
    // artist is STILL routable AND the settlement currency hasn't changed (a
    // PaymentIntent's currency is immutable). Otherwise the old intent is dead:
    // cancel it and fall back to a manual deposit.
    const reuseRouting =
      stripe && amount > 0
        ? await getConnectRoutingForArtist(userId)
        : { routeCharges: false, stripeAccountId: null };
    let reuseCardIntent = !!(
      stripe &&
      amount > 0 &&
      depositsEntitled &&
      reuseRouting.routeCharges &&
      reuseRouting.stripeAccountId
    );
    if (reuseCardIntent && stripe) {
      try {
        const existing = await stripe.paymentIntents.retrieve(
          fresh.deposit_payment_intent_id,
        );
        if (existing.currency !== depositCurrency) reuseCardIntent = false;
      } catch {
        reuseCardIntent = false;
      }
    }

    if (reuseCardIntent && stripe) {
      // F5 (RS-3): keep the live PaymentIntent's amount + fee in step with the
      // re-requested deposit. Best-effort — the webhook's amount check is the
      // backstop.
      try {
        await stripe.paymentIntents.update(fresh.deposit_payment_intent_id, {
          amount: amountCents,
          application_fee_amount: appFeeCents,
          metadata: depositMetadata,
        });
      } catch (stripeErr) {
        Sentry.captureException(stripeErr, {
          tags: { action: "stripe_update_intent" },
          extra: { bookingId: id },
        });
      }

      const { error: reuseError } = await supabase
        .from("booking_requests")
        .update({
          deposit_amount: amount,
          deposit_currency: depositCurrency,
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
    } else {
      // Can't reuse the card intent → cancel the dead one and convert this
      // booking to a manual deposit (null intent fields).
      if (stripe) {
        try {
          await stripe.paymentIntents.cancel(fresh.deposit_payment_intent_id);
        } catch {
          // already paid/cancelled — nothing to undo.
        }
      }
      const { error: manualError } = await supabase
        .from("booking_requests")
        .update({
          deposit_amount: amount,
          deposit_currency: depositCurrency,
          deposit_due_at: dueAt,
          deposit_note: note || null,
          deposit_policy: depositPolicy,
          deposit_policy_snapshot: depositPolicySnapshot,
          deposit_payment_intent_id: null,
          deposit_client_secret: null,
          status: "deposit_pending",
          decided_at: decidedAt,
          updated_at: decidedAt,
        })
        .eq("id", id);
      if (manualError) return { error: manualError.message };
    }

    await notifyDepositRequested(
      supabase,
      id,
      userId,
      booking,
      amount,
      dueAt,
      note,
      depositCurrency,
    );
    return { success: true };
  }

  let paymentIntentId: string | null = null;
  let clientSecret: string | null = null;
  let routedToConnect = false;
  if (stripe && amount > 0) {
    // OT-12.2 destination charge routing. When the artist has finished Stripe
    // Connect onboarding, create the intent with `on_behalf_of` (artist is
    // merchant of record, LO-2) + `transfer_data.destination` so funds settle
    // into the artist's balance. RS-2: only collect THROUGH Inklee when the
    // artist has an active Connect account; un-connected artists get a MANUAL
    // deposit (no PaymentIntent) instead of the deposit riding on Inklee's own
    // platform account.
    const routing = await getConnectRoutingForArtist(userId);
    if (routing.routeCharges && routing.stripeAccountId && depositsEntitled) {
      const intentParams: Stripe.PaymentIntentCreateParams = {
        amount: amountCents,
        currency: depositCurrency,
        automatic_payment_methods: { enabled: true },
        metadata: depositMetadata,
        description: `Tattoo deposit - booking ${id}`,
        on_behalf_of: routing.stripeAccountId,
        transfer_data: { destination: routing.stripeAccountId },
        // Platform fee. Customer pays exactly `amount`; `application_fee_amount`
        // is the full 3% (Custom Connect, fees.payer = application: Stripe bills
        // its processing fee to Inklee's balance, so Inklee nets 3% − Stripe).
        // `on_behalf_of` keeps the artist as merchant of record. When Inklee
        // sponsors fees (Slice 81) `appFeeCents` is 0.
        application_fee_amount: appFeeCents,
      };
      try {
        const intent = await stripe.paymentIntents.create(intentParams, {
          // One intent per booking even under rapid re-submits / retries.
          idempotencyKey: `deposit-intent-${id}`,
        });
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
      deposit_currency: depositCurrency,
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
    actor: userId,
    details: {
      from: booking.status,
      to: "deposit_pending",
      amount,
      due_at: dueAt,
      stripe: !!paymentIntentId,
      stripe_connect_routed: routedToConnect,
    },
  });

  await notifyDepositRequested(
    supabase,
    id,
    userId,
    booking,
    amount,
    dueAt,
    note,
    depositCurrency,
  );
  return { success: true };
}

export async function markDepositReceivedCore(
  supabase: SupabaseClient,
  userId: string,
  id: string,
): Promise<BookingMutationResult> {
  const authorised = await getAuthorisedBooking(supabase, userId, id);
  if ("error" in authorised) return authorised;

  const { booking } = authorised;
  const guard = canTransition(booking.status, "approved");
  if (!guard.ok) return { error: guard.reason };

  // F7: if this deposit was set up for in-app card payment, an unpaid
  // PaymentIntent is still outstanding. Marking it received manually (client
  // paid another way) must cancel that intent, otherwise the client could still
  // pay by card afterwards for a booking that's already confirmed. Best-effort.
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
  const { data: markedRows, error } = await supabase
    .from("booking_requests")
    .update({
      status: "approved",
      updated_at: decidedAt,
      decided_at: booking.decided_at ?? decidedAt,
      deposit_paid_at: decidedAt,
    })
    .eq("id", id)
    .eq("status", booking.status)
    .select("id");

  if (error) {
    Sentry.captureException(error, {
      tags: { action: "booking_status_change" },
    });
    return { error: error.message };
  }

  if (!markedRows || markedRows.length === 0) {
    return { error: "This booking just changed. Refresh and try again." };
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
    actor: userId,
    details: { from: booking.status, to: "approved", via: "deposit_received" },
  });

  return { success: true };
}

// RS-6: refund a paid in-app card deposit. Full refund only. Money mechanics
// (destination charge): reverse_transfer pulls the amount back from the artist's
// connected account; refund_application_fee returns Inklee's platform fee.
// Stripe's processing fee is non-refundable and stays with the artist —
// identical to refunding from the Stripe dashboard. Manual deposits can't be
// refunded here.
export async function refundDepositCore(
  supabase: SupabaseClient,
  userId: string,
  id: string,
): Promise<BookingMutationResult> {
  const authorised = await getAuthorisedBooking(supabase, userId, id);
  if ("error" in authorised) return authorised;

  const { data: fresh } = await supabase
    .from("booking_requests")
    .select(
      "deposit_payment_intent_id, deposit_paid_at, deposit_amount, deposit_currency",
    )
    .eq("id", id)
    .single();

  if (!fresh?.deposit_payment_intent_id || !fresh?.deposit_paid_at) {
    return {
      error: "There's no paid card deposit to refund for this booking.",
    };
  }

  // Idempotency guard: bail if a refund is already logged for this booking. The
  // Stripe idempotency key below is the real safety net against a race.
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
    actor: userId,
    details: {
      refund_id: refundId,
      currency: fresh.deposit_currency ?? "eur",
      amount_eur: fresh.deposit_amount ? Number(fresh.deposit_amount) : null,
      payment_intent_id: fresh.deposit_payment_intent_id,
    },
  });

  return { success: true };
}

// D-f (P0-2): artist-initiated cancellation. Direction is the inverse of a
// client cancellation — when the ARTIST cancels, the client is made whole: a
// paid card deposit is fully refunded (money back to client, Inklee returns its
// fee, artist bears Stripe's non-refundable fee via reverse_transfer); a live
// unpaid intent is cancelled. The booking is NOT moved to cancelled if the
// refund fails, so the client's money is never stranded behind a cancelled
// booking.
export async function cancelBookingCore(
  supabase: SupabaseClient,
  userId: string,
  id: string,
): Promise<BookingMutationResult> {
  const authorised = await getAuthorisedBooking(supabase, userId, id);
  if ("error" in authorised) return authorised;

  const { booking } = authorised;
  const guard = canTransition(booking.status, "cancelled");
  if (!guard.ok) return { error: guard.reason };

  const { data: depo } = await supabase
    .from("booking_requests")
    .select("deposit_payment_intent_id, deposit_paid_at")
    .eq("id", id)
    .single();

  if (depo?.deposit_payment_intent_id && depo?.deposit_paid_at) {
    // Refund first, while the booking is still in its current state. If we
    // can't return the money, abort the cancellation and surface the error.
    // Skip when a refund is already recorded (in-app refund, or a Stripe-
    // dashboard refund mirrored by the charge.refunded webhook): otherwise
    // refundDepositCore's idempotency guard would error and abort the whole
    // cancellation, permanently wedging the booking in 'approved'.
    const { count: alreadyRefunded } = await supabase
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("booking_id", id)
      .eq("action", "deposit_refunded");
    if ((alreadyRefunded ?? 0) === 0) {
      const refund = await refundDepositCore(supabase, userId, id);
      if ("error" in refund) return refund;
    }
  } else if (stripe && depo?.deposit_payment_intent_id) {
    try {
      await stripe.paymentIntents.cancel(depo.deposit_payment_intent_id);
    } catch (cancelErr) {
      Sentry.captureException(cancelErr, {
        tags: { action: "stripe_cancel_intent_on_artist_cancel" },
        extra: { bookingId: id },
      });
    }
  }

  const cancelledAt = new Date().toISOString();
  const { data: cancelledRows, error } = await supabase
    .from("booking_requests")
    .update({ status: "cancelled", updated_at: cancelledAt })
    .eq("id", id)
    .eq("status", booking.status)
    .select("id");

  if (error) {
    Sentry.captureException(error, {
      tags: { action: "booking_status_change" },
    });
    return { error: error.message };
  }

  if (!cancelledRows || cancelledRows.length === 0) {
    return { error: "This booking just changed. Refresh and try again." };
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
    actor: userId,
    details: { from: booking.status, to: "cancelled", by: "artist" },
  });

  if (booking.customer_email) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .single();
    await sendBookingEmail({
      type: "customer_booking_cancelled_by_artist",
      to: booking.customer_email,
      artistId: userId,
      vars: {
        customer_handle: booking.customer_handle ?? "",
        artist_name: profile?.display_name ?? "",
      },
    });
  }

  return { success: true };
}

/** Editable appointment fields, already string-typed by the calling adapter
 *  (web FormData / mobile JSON). Normalization + validation live in the core. */
export type EditAppointmentInput = {
  handle: string;
  email: string | null;
  date: string;
  placement: string;
  size: string;
  description: string;
};

/**
 * Edit an accepted appointment's fields. The SINGLE source for the web calendar
 * drawer (editAppointmentAction) and the mobile PATCH /bookings/:id, so the
 * status gate + required-field validation can't diverge (BUG-5: the web copy
 * had neither and would rewrite a deposit_pending / terminal booking or blank
 * out placement/size). Approved-only by design — the only surface that exposes
 * appointment editing.
 */
export async function editAppointmentCore(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  input: EditAppointmentInput,
): Promise<BookingMutationResult> {
  const { data: booking } = await supabase
    .from("booking_requests")
    .select("artist_id, status, form_data")
    .eq("id", id)
    .single();
  if (!booking || booking.artist_id !== userId) {
    return { error: "Booking not found." };
  }
  if (booking.status !== "approved") {
    return { error: "Only accepted appointments can be edited." };
  }

  const fd = (booking.form_data ?? {}) as Record<string, string>;
  const handle = input.handle.replace(/^@/, "").trim();
  const date = input.date.trim();
  const placement = input.placement.trim();
  const size = input.size.trim();
  const description = input.description.trim();
  const email = input.email?.trim() || null;

  if (!handle) return { error: "Instagram handle is required." };
  if (!date) return { error: "Date is required." };
  if (!placement) return { error: "Placement is required." };
  if (!size) return { error: "Size is required." };

  const { error } = await supabase
    .from("booking_requests")
    .update({
      customer_handle: handle,
      customer_email: email,
      preferred_date: date,
      form_data: { ...fd, placement, size, description },
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    booking_id: id,
    action: "booking_edited",
    actor: userId,
    details: { by: "artist" },
  });

  return { success: true };
}

/** Fields for a manual (artist-authored) appointment, already string-typed by
 *  the calling adapter (web FormData / mobile JSON). */
export type CreateAppointmentInput = {
  handle: string;
  email: string | null;
  date: string;
  placement: string;
  size: string;
  description: string;
  /** Send the branded approval email with a magic link (needs an email). */
  sendEmail: boolean;
};

/**
 * Create an artist-authored approved booking (a manual calendar appointment).
 * The SINGLE source for the web createAppointmentAction and the mobile POST
 * /calendar/appointments, so the security-sensitive bits (the magic-link token
 * generation + hashing, the inserted row shape, the audit row, the approval
 * email) live in one place and can't drift. Returns the new booking id or an
 * error string.
 */
export async function createAppointmentCore(
  supabase: SupabaseClient,
  userId: string,
  input: CreateAppointmentInput,
): Promise<{ id: string } | { error: string }> {
  const handle = input.handle.replace(/^@/, "").trim();
  const date = input.date.trim();
  const placement = input.placement.trim();
  const size = input.size.trim();
  const description = input.description.trim();
  const email = input.email?.trim() || null;

  if (!handle) return { error: "Instagram handle is required." };
  if (!date) return { error: "Date is required." };
  if (!placement) return { error: "Placement is required." };
  if (!size) return { error: "Size is required." };

  const bookingId = crypto.randomUUID();
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const decidedAt = new Date().toISOString();

  const { error } = await supabase.from("booking_requests").insert({
    id: bookingId,
    artist_id: userId,
    status: "approved",
    origin: "artist_created",
    customer_handle: handle,
    customer_email: email,
    // Only mint a usable magic link when there's an email to send it to.
    customer_token_hash: email ? tokenHash : null,
    preferred_date: date,
    form_data: { placement, size, description },
    decided_at: decidedAt,
    updated_at: decidedAt,
  });
  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    booking_id: bookingId,
    action: "booking_created",
    actor: userId,
    details: { origin: "artist_created" },
  });

  if (email && input.sendEmail) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, slug")
      .eq("id", userId)
      .single();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";
    await sendBookingEmail({
      type: "customer_booking_approved",
      to: email,
      artistId: userId,
      vars: {
        customer_handle: handle,
        artist_name: profile?.display_name ?? "",
        artist_slug: profile?.slug ?? "",
        placement,
        size,
        date,
        magic_link: `${appUrl}/request/${token}`,
      },
    });
  }

  return { id: bookingId };
}
