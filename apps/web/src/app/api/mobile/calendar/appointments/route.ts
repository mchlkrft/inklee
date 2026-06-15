import crypto from "crypto";
import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { sendBookingEmail } from "@/lib/email/send-booking-email";

export const runtime = "nodejs";

// POST /api/mobile/calendar/appointments — create an artist-authored approved
// booking (a manual calendar appointment). Ports the web createAppointmentAction:
// inserts an approved booking_requests row (origin=artist_created), writes the
// audit row, and optionally sends the branded approval email with a magic link.
// RLS scopes the insert to the artist. The mobile client invalidates /calendar
// after success (no revalidatePath needed here).
export async function POST(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  let raw: Record<string, unknown>;
  try {
    raw = (await req.json()) as Record<string, unknown>;
  } catch {
    return mobileError(400, "Invalid JSON body.");
  }

  const handle = String(raw.handle ?? "")
    .replace(/^@/, "")
    .trim();
  const date = String(raw.date ?? "").trim();
  const placement = String(raw.placement ?? "").trim();
  const size = String(raw.size ?? "").trim();
  const description = String(raw.description ?? "").trim();
  const email = (raw.email ? String(raw.email).trim() : "") || null;
  const sendEmail = raw.sendEmail === true;

  if (!handle) return mobileError(400, "Instagram handle is required.");
  if (!date) return mobileError(400, "Date is required.");
  if (!placement) return mobileError(400, "Placement is required.");
  if (!size) return mobileError(400, "Size is required.");

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
    customer_token_hash: email ? tokenHash : null,
    preferred_date: date,
    form_data: { placement, size, description },
    decided_at: decidedAt,
    updated_at: decidedAt,
  });
  if (error) return mobileError(500, error.message);

  await supabase.from("audit_log").insert({
    booking_id: bookingId,
    action: "booking_created",
    actor: userId,
    details: { origin: "artist_created" },
  });

  if (email && sendEmail) {
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

  return mobileOk({ id: bookingId });
}
