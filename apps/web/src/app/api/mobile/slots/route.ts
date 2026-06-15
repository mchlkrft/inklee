import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { listSlotsForArtist } from "@/lib/server/slots";
import { formatSlotDisplay } from "@/lib/timezone";
import { dateKeyInTimeZone } from "@/lib/date-utils";
import type {
  MobileSlot,
  MobileSlotsResponse,
} from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// GET /api/mobile/slots — the artist's slot list for the native slots manager.
// Same read as the web settings page (lib/server/slots.ts listSlotsForArtist),
// with date/time labels rendered server-side in the artist's profile timezone
// via the shared formatSlotDisplay (Hermes iOS has no Intl, so the client only
// groups and renders strings).
export async function GET(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const [profileRes, slotsResult] = await Promise.all([
    supabase.from("profiles").select("timezone").eq("id", userId).single(),
    listSlotsForArtist(supabase, userId),
  ]);
  if (profileRes.error || !profileRes.data) {
    return mobileError(500, profileRes.error?.message ?? "Profile not found.");
  }
  if ("error" in slotsResult) return mobileError(500, slotsResult.error);
  const timezone =
    (profileRes.data.timezone as string | null) ?? "Europe/Berlin";

  const items: MobileSlot[] = slotsResult.slots.map((s) => {
    const display = formatSlotDisplay(
      s.starts_at,
      s.duration_minutes,
      timezone,
    );
    return {
      id: s.id,
      startsAt: s.starts_at,
      dateKey: dateKeyInTimeZone(s.starts_at, timezone),
      dateLabel: display.date,
      timeLabel: display.time,
      durationMinutes: s.duration_minutes,
      status: s.status,
    };
  });

  const body: MobileSlotsResponse = { timezone, items };
  return mobileOk(body);
}
