"use server";

import { createClient } from "@/lib/supabase/server";
import { checkGrowthEventsRateLimit } from "@/lib/ratelimit";
import { recordGrowthEvent } from "@/lib/growth/record-event";

const SURFACES = ["onboarding_done", "dashboard", "link_hub"] as const;
type CopySurface = (typeof SURFACES)[number];

/**
 * Fire-and-forget growth event for a booking-link copy. Called from client
 * copy buttons; must never affect the UI, so it always resolves to null.
 * Shares the growth-events rate limit with the mobile endpoint so one account
 * cannot flood analytics_events from either surface.
 */
export async function recordBookingLinkCopiedAction(
  surface: string,
): Promise<null> {
  if (!SURFACES.includes(surface as CopySurface)) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { allowed } = await checkGrowthEventsRateLimit(user.id);
  if (!allowed) return null;

  void recordGrowthEvent(
    {
      event: "booking_link_copied",
      props: { surface: surface as CopySurface },
    },
    { artistId: user.id, source: "web", email: user.email },
  );
  return null;
}
