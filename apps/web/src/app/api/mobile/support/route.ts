import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { createSupportTicket } from "@/lib/server/support";
import {
  validateTicketInput,
  isSupportCategory,
  hasUnreadAdminReply,
  type SupportTicketInput,
  type SupportCategory,
} from "@/lib/support";
import type {
  MobileSupportList,
  MobileSupportTicketListItem,
  MobileSupportCreateResult,
} from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// GET /api/mobile/support — the signed-in artist's tickets, newest activity
// first. Mirrors the web /support list; the access-scoped client + explicit
// artist_id filter keep the read tenant-scoped even if RLS regresses.
export async function GET(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const { data } = await supabase
    .from("support_tickets")
    .select(
      "id, reference, subject, category, status, updated_at, last_admin_reply_at, artist_seen_at",
    )
    .eq("artist_id", userId)
    .order("updated_at", { ascending: false });

  const tickets: MobileSupportTicketListItem[] = (data ?? []).map((t) => ({
    id: t.id,
    reference: t.reference,
    subject: t.subject,
    category: t.category as SupportCategory,
    status: t.status,
    updatedAt: t.updated_at,
    unread: hasUnreadAdminReply({
      last_admin_reply_at: t.last_admin_reply_at,
      artist_seen_at: t.artist_seen_at,
    }),
  }));

  const body: MobileSupportList = { tickets };
  return mobileOk(body);
}

// POST /api/mobile/support — create a ticket. Same shared validation + server
// core (emails, audit, per-hour cap) as the web action; the body is camelCase
// JSON matching SupportTicketInput.
export async function POST(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  if (!auth.email) {
    return mobileError(400, "Your account has no email on file.");
  }

  let raw: Record<string, unknown> = {};
  try {
    raw = ((await req.json()) as Record<string, unknown>) ?? {};
  } catch {
    return mobileError(400, "Invalid JSON body.");
  }
  const str = (k: string) =>
    typeof raw[k] === "string" ? (raw[k] as string).trim() : "";
  const input: SupportTicketInput = {
    subject: str("subject"),
    category: str("category"),
    description: str("description"),
    expectedBehavior: str("expectedBehavior"),
    actualBehavior: str("actualBehavior"),
    reproductionSteps: str("reproductionSteps"),
    relevantArea: str("relevantArea"),
    deviceInfo: str("deviceInfo"),
    platformInfo: str("platformInfo"),
    additionalContext: str("additionalContext"),
  };

  const validationError = validateTicketInput(input);
  if (validationError) return mobileError(400, validationError, "invalid");
  if (!isSupportCategory(input.category)) {
    return mobileError(400, "Pick a category.", "invalid");
  }

  const result = await createSupportTicket({
    artistId: auth.userId,
    artistEmail: auth.email,
    input: input as SupportTicketInput & { category: SupportCategory },
  });
  if ("error" in result) return mobileError(400, result.error);

  const out: MobileSupportCreateResult = {
    id: result.id,
    reference: result.reference,
  };
  return mobileOk(out);
}
