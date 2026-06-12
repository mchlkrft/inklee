import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { normalizeBookingMode } from "@/lib/mobile-settings";
import { serviceClient } from "@/lib/supabase/service";
import { createNotification } from "@/lib/notifications";
import { writeAudit } from "@/lib/audit";
import type { MobileBookingModeUpdate } from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// POST /api/mobile/settings/booking-mode  { bookingMode } — switch between
// preferred_date and fixed_slots. Port of the web saveBookingModeAction
// (same enum check, RLS own-row update, booking_mode_changed audit) plus a
// server-side port of the web's "skip slot setup" branch: the app has no slot
// builder, so switching to fixed_slots with zero open slots files the same
// deduped no_slots_warning notification the web creates when the artist skips
// the post-save slot modal. Notification failure never fails the mode save.
export async function POST(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  let body: { bookingMode?: unknown };
  try {
    body = await req.json();
  } catch {
    return mobileError(400, "Invalid JSON body.");
  }
  const parsed = normalizeBookingMode(body.bookingMode);
  if (!parsed.ok) return mobileError(400, parsed.error);
  const mode = parsed.value;

  const { error } = await supabase
    .from("profiles")
    .update({ booking_mode: mode, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) return mobileError(500, error.message);

  void writeAudit({
    action: "booking_mode_changed",
    actor: userId,
    category: "settings",
    details: { to: mode },
  });

  // Same open-slot count as GET /booking-form so the two screens never
  // disagree about the fixed-slots-without-slots warning. A failed count must
  // read as "unknown", not zero — otherwise a transient error files a false
  // high-priority no-slots notification for an artist who has slots.
  const { count, error: slotsError } = await supabase
    .from("slots")
    .select("*", { count: "exact", head: true })
    .eq("artist_id", userId)
    .eq("status", "open");
  if (slotsError) {
    console.error(
      "[mobile/booking-mode] slot count failed",
      slotsError.message,
    );
  }
  const openSlotCount = count ?? 0;
  const isFixedSlotsWithoutSlots =
    mode === "fixed_slots" && !slotsError && openSlotCount === 0;

  if (isFixedSlotsWithoutSlots) {
    try {
      const { count: existing } = await serviceClient
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("artist_id", userId)
        .eq("type", "system_warning")
        .is("is_resolved", false)
        .contains("metadata", { warning_type: "no_slots_warning" });
      if ((existing ?? 0) === 0) {
        await createNotification({
          artistId: userId,
          type: "system_warning",
          category: "system_warning",
          priority: "high",
          title: "No time slots set up yet",
          message:
            "Fixed slots mode is active but no time slots have been added. Clients cannot book until you create some slots.",
          ctaLabel: "Set up slots",
          ctaHref: "/bookings/settings",
          isResolved: false,
          metadata: { warning_type: "no_slots_warning" },
        });
      }
    } catch (e) {
      console.error("[mobile/booking-mode] no-slots warning failed", e);
    }
  }

  const result: MobileBookingModeUpdate = {
    bookingMode: mode,
    openSlotCount,
    isFixedSlotsWithoutSlots,
  };
  return mobileOk(result);
}
