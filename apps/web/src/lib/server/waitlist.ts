// Shared waitlist conversion core — the single source of truth for "move a
// waitlist entry to an accepted booking", consumed by the web Server Action
// (convertWaitlistEntry) and the mobile route (POST /api/mobile/waitlist/:id/
// convert) so the guards + the magic-link/booking insert contract cannot drift
// (ME-10). Both callers pass an RLS-scoped client + the authenticated userId.

import crypto from "crypto";
import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendWaitlistConversionEmail } from "@/lib/email/send-booking-email";

export type ConvertWaitlistResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

/**
 * Convert a waitlist entry into an accepted booking. Reads the entry from the DB
 * (never trusts caller-supplied email/handle), rejects a non-convertible status
 * or a missing email, then CLAIMS the row with a conditional update BEFORE
 * inserting the booking so two concurrent converts (web + app, a double tap, or
 * a retry-after-timeout) can't both create a booking and double-email the
 * client. Releases the claim if the booking insert fails.
 */
export async function convertWaitlistEntryCore(
  supabase: SupabaseClient,
  userId: string,
  entryId: string,
): Promise<ConvertWaitlistResult> {
  const { data: entry } = await supabase
    .from("waitlist_entries")
    .select("customer_email, customer_handle, note, status")
    .eq("id", entryId)
    .eq("artist_id", userId)
    .single();
  if (!entry) {
    return { ok: false, status: 404, error: "Waitlist entry not found." };
  }
  if (entry.status === "converted") {
    return {
      ok: false,
      status: 409,
      error: "This entry was already converted.",
    };
  }
  if (!entry.customer_email) {
    return {
      ok: false,
      status: 400,
      error: "This entry has no email to convert.",
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .single();

  // Claim FIRST with a conditional update; zero rows back = someone else won the
  // race (already converted) and we must not insert a second booking.
  const { data: claimed, error: claimError } = await supabase
    .from("waitlist_entries")
    .update({ status: "converted" })
    .eq("id", entryId)
    .eq("artist_id", userId)
    .neq("status", "converted")
    .select("id");
  if (claimError) return { ok: false, status: 500, error: claimError.message };
  if (!claimed || claimed.length === 0) {
    return {
      ok: false,
      status: 409,
      error: "This entry was already converted.",
    };
  }

  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const decidedAt = new Date().toISOString();

  const { error } = await supabase.from("booking_requests").insert({
    artist_id: userId,
    status: "approved",
    origin: "artist_created",
    customer_email: entry.customer_email,
    customer_handle: entry.customer_handle,
    customer_token_hash: tokenHash,
    // Mark the waitlist origin in form_data (no enum migration needed) so the
    // requests list can flag it with a "Waitlist" chip (78c/DT-5).
    form_data: { description: entry.note || "", source: "waitlist" },
    decided_at: decidedAt,
    updated_at: decidedAt,
  });
  if (error) {
    Sentry.captureException(error, { tags: { action: "waitlist_convert" } });
    // Release the claim so the entry stays convertible after a failed insert.
    await supabase
      .from("waitlist_entries")
      .update({ status: entry.status })
      .eq("id", entryId)
      .eq("artist_id", userId);
    return { ok: false, status: 500, error: error.message };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";
  await sendWaitlistConversionEmail({
    to: entry.customer_email,
    artistName: profile?.display_name ?? "",
    magicLink: `${appUrl}/request/${token}`,
    customerHandle: entry.customer_handle ?? "",
  });

  return { ok: true };
}
