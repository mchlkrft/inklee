import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { createNotification } from "@/lib/notifications";
import { sendEmail } from "@/lib/email/send";
import { escapeHtml, renderEmailShell } from "@/lib/email/layout";
import { formatDateKey } from "@inklee/shared/date-utils";

// Guest spot notification wiring (Q9 resolved 2026-07-19: email + push).
// Mirrors the booking pattern: an in-app feed row (push rides along inside
// createNotification), plus one transactional email per request/decision
// state change - nothing chattier. Every function here is best-effort and
// never throws: a notification failure must never fail the workflow.
//
// Quiet hold stays quiet by design: requests from blacklisted artists send
// NOTHING to the studio owner (the locked founder decision).

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";

type GuestSpotEvent =
  | {
      kind: "request_submitted";
      requestId: string;
      artistId: string;
      studioProfileId: string;
      startDate: string;
      endDate: string;
    }
  | {
      kind: "request_accepted";
      requestId: string;
      artistId: string;
      studioProfileId: string;
      startDate: string;
      endDate: string;
    }
  | {
      kind: "proposal_accepted";
      requestId: string;
      artistId: string;
      studioProfileId: string;
      startDate: string;
      endDate: string;
    }
  | {
      kind: "request_passed";
      requestId: string;
      artistId: string;
      studioProfileId: string;
    }
  | {
      kind: "dates_suggested";
      requestId: string;
      artistId: string;
      studioProfileId: string;
      startDate: string;
      endDate: string;
    }
  | {
      kind: "stay_cancelled";
      requestId: string | null;
      artistId: string;
      studioProfileId: string;
      cancelledBy: "artist" | "studio";
    };

async function artistName(userId: string): Promise<string> {
  const { data } = await serviceClient
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();
  return (data?.display_name as string | null)?.trim() || "An artist";
}

async function studioInfo(
  studioProfileId: string,
): Promise<{ name: string; ownerId: string | null }> {
  const { data } = await serviceClient
    .from("studio_profiles")
    .select("name, owner_user_id")
    .eq("id", studioProfileId)
    .maybeSingle();
  return {
    name: (data?.name as string | null)?.trim() || "A studio",
    ownerId: (data?.owner_user_id as string | null) ?? null,
  };
}

async function emailFor(userId: string): Promise<string | null> {
  try {
    const { data } = await serviceClient.auth.admin.getUserById(userId);
    return data.user?.email ?? null;
  } catch {
    return null;
  }
}

async function isQuietHeld(
  studioProfileId: string,
  artistId: string,
): Promise<boolean> {
  const { data, error } = await serviceClient
    .from("studio_blacklists")
    .select("id")
    .eq("studio_profile_id", studioProfileId)
    .eq("artist_user_id", artistId)
    .limit(1)
    .maybeSingle();
  // A failed read fails QUIET: notifying about a quiet-held request is the
  // worse error (it defeats the feature's whole point).
  if (error) return true;
  return Boolean(data);
}

function dateRange(start: string, end: string): string {
  return start === end
    ? formatDateKey(start)
    : `${formatDateKey(start)} to ${formatDateKey(end)}`;
}

async function sendGuestSpotEmail(
  to: string | null,
  subject: string,
  lines: string[],
  ctaHref: string,
  ctaLabel: string,
): Promise<void> {
  if (!to) return;
  const body = lines
    .map((l) => `<p style="margin:0 0 12px 0;">${escapeHtml(l)}</p>`)
    .join("");
  const button = `<p style="margin:20px 0 0 0;"><a href="${APP_ORIGIN}${ctaHref}" style="display:inline-block;background:#1e1e1e;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;">${escapeHtml(ctaLabel)}</a></p>`;
  try {
    await sendEmail({
      to,
      subject,
      html: renderEmailShell({ contentHtml: body + button }),
    });
  } catch (err) {
    console.error("[guest-spot-email] send failed:", err);
  }
}

/**
 * The one entry point the guest spot cores call after a successful state
 * change. Best-effort: logs and returns on any failure.
 */
export async function notifyGuestSpotEvent(
  event: GuestSpotEvent,
): Promise<void> {
  try {
    const studio = await studioInfo(event.studioProfileId);

    if (event.kind === "request_submitted") {
      if (!studio.ownerId) return;
      // The quiet hold: blacklisted artists' requests reach the collapsed
      // inbox section and NOTHING else.
      if (await isQuietHeld(event.studioProfileId, event.artistId)) return;
      const name = await artistName(event.artistId);
      const when = dateRange(event.startDate, event.endDate);
      await createNotification({
        artistId: studio.ownerId,
        type: "guest_spot_request",
        category: "booking_activity",
        priority: "high",
        title: "New guest spot request",
        message: `${name} asked about a guest spot (${when}).`,
        ctaLabel: "Open the request",
        ctaHref: `/studio/requests/${event.requestId}`,
        metadata: { guest_spot_request_id: event.requestId },
      });
      await sendGuestSpotEmail(
        await emailFor(studio.ownerId),
        "New guest spot request",
        [
          `${name} asked about a guest spot at ${studio.name}.`,
          `Dates: ${when}.`,
          "Accept, pass, or suggest different dates from your studio inbox.",
        ],
        `/studio/requests/${event.requestId}`,
        "Open the request",
      );
      return;
    }

    if (event.kind === "request_accepted") {
      const when = dateRange(event.startDate, event.endDate);
      await createNotification({
        artistId: event.artistId,
        type: "guest_spot_accepted",
        category: "booking_activity",
        priority: "high",
        title: "Guest spot confirmed",
        message: `${studio.name} accepted your request (${when}). The stay is on your calendar.`,
        ctaLabel: "View the stay",
        ctaHref: `/travel/requests/${event.requestId}`,
        metadata: { guest_spot_request_id: event.requestId },
      });
      await sendGuestSpotEmail(
        await emailFor(event.artistId),
        `Guest spot confirmed at ${studio.name}`,
        [
          `${studio.name} accepted your guest spot request.`,
          `Dates: ${when}. The stay and travel dates are on your Inklee calendar.`,
        ],
        `/travel/requests/${event.requestId}`,
        "View the stay",
      );
      return;
    }

    if (event.kind === "proposal_accepted") {
      if (!studio.ownerId) return;
      const name = await artistName(event.artistId);
      const when = dateRange(event.startDate, event.endDate);
      await createNotification({
        artistId: studio.ownerId,
        type: "guest_spot_accepted",
        category: "booking_activity",
        priority: "high",
        title: "Guest spot confirmed",
        message: `${name} took your suggested dates (${when}).`,
        ctaLabel: "Open the request",
        ctaHref: `/studio/requests/${event.requestId}`,
        metadata: { guest_spot_request_id: event.requestId },
      });
      await sendGuestSpotEmail(
        await emailFor(studio.ownerId),
        "Guest spot confirmed",
        [
          `${name} took your suggested dates for a guest spot at ${studio.name}.`,
          `Dates: ${when}.`,
        ],
        `/studio/requests/${event.requestId}`,
        "Open the request",
      );
      return;
    }

    if (event.kind === "request_passed") {
      await createNotification({
        artistId: event.artistId,
        type: "guest_spot_passed",
        category: "booking_activity",
        priority: "medium",
        title: "Guest spot request passed",
        message: `${studio.name} passed on your guest spot request this time.`,
        ctaLabel: "View request",
        ctaHref: `/travel/requests/${event.requestId}`,
        metadata: { guest_spot_request_id: event.requestId },
      });
      await sendGuestSpotEmail(
        await emailFor(event.artistId),
        "About your guest spot request",
        [
          `${studio.name} passed on your guest spot request this time.`,
          "Other studios on the map are taking requests.",
        ],
        "/map",
        "Browse the map",
      );
      return;
    }

    if (event.kind === "dates_suggested") {
      const when = dateRange(event.startDate, event.endDate);
      await createNotification({
        artistId: event.artistId,
        type: "guest_spot_dates",
        category: "booking_activity",
        priority: "high",
        title: "Different dates suggested",
        message: `${studio.name} suggested ${when} for your guest spot.`,
        ctaLabel: "Review the dates",
        ctaHref: `/travel/requests/${event.requestId}`,
        metadata: { guest_spot_request_id: event.requestId },
      });
      await sendGuestSpotEmail(
        await emailFor(event.artistId),
        `${studio.name} suggested different dates`,
        [
          `${studio.name} suggested different dates for your guest spot: ${when}.`,
          "Take the dates or reply with your request open.",
        ],
        `/travel/requests/${event.requestId}`,
        "Review the dates",
      );
      return;
    }

    if (event.kind === "stay_cancelled") {
      const cancelledByStudio = event.cancelledBy === "studio";
      const recipientId = cancelledByStudio ? event.artistId : studio.ownerId;
      if (!recipientId) return;
      const counterpart = cancelledByStudio
        ? studio.name
        : await artistName(event.artistId);
      const href = event.requestId
        ? cancelledByStudio
          ? `/travel/requests/${event.requestId}`
          : `/studio/requests/${event.requestId}`
        : cancelledByStudio
          ? "/travel"
          : "/studio";
      await createNotification({
        artistId: recipientId,
        type: "guest_spot_cancelled",
        category: "booking_activity",
        priority: "high",
        title: "Guest spot cancelled",
        message: `${counterpart} cancelled the guest spot stay.`,
        ctaLabel: "View details",
        ctaHref: href,
        metadata: { guest_spot_request_id: event.requestId },
      });
      await sendGuestSpotEmail(
        await emailFor(recipientId),
        "Guest spot cancelled",
        [
          `${counterpart} cancelled the guest spot stay.`,
          "The calendar entries were removed.",
        ],
        href,
        "View details",
      );
    }
  } catch (err) {
    console.error("[guest-spot-notify] failed:", err);
  }
}
