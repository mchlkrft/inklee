import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { markTicketSeen } from "@/lib/server/support";
import {
  canArtistReply,
  type SupportCategory,
  type SupportStatus,
} from "@/lib/support";
import { UUID_RE } from "@/lib/mobile-booking-form";
import type {
  MobileSupportTicketDetail,
  MobileSupportMessage,
} from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// GET /api/mobile/support/:id — a ticket the artist owns, its report fields, and
// its public conversation (internal notes are hidden by RLS, exactly as on the
// web ticket page). Reading it stamps the ticket seen so the "New reply" flag
// clears. Returns 404 for a ticket the artist does not own.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { id } = await params;
  if (!UUID_RE.test(id))
    return mobileError(404, "Ticket not found.", "not_found");
  const { userId, supabase } = auth;

  const { data: ticket } = await supabase
    .from("support_tickets")
    .select(
      "id, reference, subject, category, status, description, expected_behavior, actual_behavior, reproduction_steps, relevant_area, device_info, platform_info, additional_context, created_at, updated_at",
    )
    .eq("id", id)
    .eq("artist_id", userId)
    .maybeSingle();
  if (!ticket) return mobileError(404, "Ticket not found.", "not_found");

  const { data: msgs } = await supabase
    .from("support_ticket_messages")
    .select("id, author_role, body, created_at")
    .eq("ticket_id", id)
    .order("created_at", { ascending: true });

  await markTicketSeen(id, userId);

  const messages: MobileSupportMessage[] = (msgs ?? []).map((m) => ({
    id: m.id,
    authorRole: m.author_role as "artist" | "admin",
    body: m.body,
    createdAt: m.created_at,
  }));

  const body: MobileSupportTicketDetail = {
    id: ticket.id,
    reference: ticket.reference,
    subject: ticket.subject,
    category: ticket.category as SupportCategory,
    status: ticket.status as SupportStatus,
    description: ticket.description,
    expectedBehavior: ticket.expected_behavior,
    actualBehavior: ticket.actual_behavior,
    reproductionSteps: ticket.reproduction_steps,
    relevantArea: ticket.relevant_area,
    deviceInfo: ticket.device_info,
    platformInfo: ticket.platform_info,
    additionalContext: ticket.additional_context,
    createdAt: ticket.created_at,
    updatedAt: ticket.updated_at,
    canReply: canArtistReply(ticket.status as SupportStatus),
    messages,
  };
  return mobileOk(body);
}
