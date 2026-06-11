import crypto from "crypto";
import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { sendWaitlistConversionEmail } from "@/lib/email/send-booking-email";

export const runtime = "nodejs";

// POST /api/mobile/waitlist/:id/convert — move a waitlist entry to an accepted
// booking. Ports convertWaitlistEntry: inserts an approved booking_requests row
// (origin=artist_created, source=waitlist), marks the entry converted, and emails
// the client a magic link. RLS-scoped; needs an email to send the link.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;
  const { id } = await params;

  const { data: entry } = await supabase
    .from("waitlist_entries")
    .select("customer_email, customer_handle, note, status")
    .eq("id", id)
    .eq("artist_id", userId)
    .single();
  if (!entry) return mobileError(404, "Waitlist entry not found.", "not_found");
  if (entry.status === "converted") {
    return mobileError(409, "This entry was already converted.");
  }
  if (!entry.customer_email) {
    return mobileError(400, "This entry has no email to convert.");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .single();

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
    form_data: { description: entry.note || "", source: "waitlist" },
    decided_at: decidedAt,
    updated_at: decidedAt,
  });
  if (error) return mobileError(500, error.message);

  await supabase
    .from("waitlist_entries")
    .update({ status: "converted" })
    .eq("id", id);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";
  await sendWaitlistConversionEmail({
    to: entry.customer_email,
    artistName: profile?.display_name ?? "",
    magicLink: `${appUrl}/request/${token}`,
    customerHandle: entry.customer_handle ?? "",
  });

  return mobileOk({ id, status: "converted" });
}
