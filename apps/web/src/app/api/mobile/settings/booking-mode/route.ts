import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { normalizeBookingMode } from "@/lib/mobile-settings";
import { fileNoSlotsWarning, queryOpenSlotCount } from "@/lib/server/slots";
import { writeAudit } from "@/lib/audit";
import type { MobileBookingModeUpdate } from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// POST /api/mobile/settings/booking-mode  { bookingMode } — switch between
// preferred_date and fixed_slots. Port of the web saveBookingModeAction
// (same enum check, RLS own-row update, booking_mode_changed audit) plus a
// server-side port of the web's "skip slot setup" branch: switching to
// fixed_slots with zero open slots files the same deduped no_slots_warning
// the web creates when the artist skips the post-save slot modal; on mobile
// the notification routes into the native slots manager (/settings/slots).
// Notification failure never fails the mode save.
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

  // Shared count (lib/server/slots.ts) so every openSlotCount consumer agrees.
  // A failed count must read as "unknown", not zero — otherwise a transient
  // error files a false high-priority no-slots notification for an artist who
  // has slots.
  const slotCount = await queryOpenSlotCount(supabase, userId);
  if ("error" in slotCount) {
    console.error("[mobile/booking-mode] slot count failed", slotCount.error);
  }
  const openSlotCount = "count" in slotCount ? slotCount.count : 0;
  const isFixedSlotsWithoutSlots =
    mode === "fixed_slots" && "count" in slotCount && openSlotCount === 0;

  if (isFixedSlotsWithoutSlots) {
    try {
      // The same deduped filing the web skip action uses; failure never fails
      // the mode save.
      await fileNoSlotsWarning(userId);
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
