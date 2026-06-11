import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { DEFAULT_BODIES } from "@/lib/email/booking-templates";
import { isEmailTemplateType } from "@inklee/shared/email-templates";
import type { MobileEmailTemplateReset } from "@inklee/shared/mobile-api";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

// POST /api/mobile/settings/email-templates/reset { type } — delete the
// artist's custom body so the system default applies again. Ports
// resetTemplateAction (settings/emails/actions.ts) including the audit entry,
// and returns the default body so the editor can restore it without caching
// defaults on-device.
export async function POST(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return mobileError(400, "Invalid JSON body.");
  }
  const { type } = (raw ?? {}) as { type?: unknown };
  if (!isEmailTemplateType(type)) {
    return mobileError(400, "Unknown template type.");
  }

  const { error } = await supabase
    .from("email_templates")
    .delete()
    .eq("artist_id", userId)
    .eq("type", type);
  if (error) return mobileError(500, error.message);

  void writeAudit({
    action: "email_template_reset",
    actor: userId,
    category: "settings",
    details: { template_type: type },
  });

  const data: MobileEmailTemplateReset = { body: DEFAULT_BODIES[type] ?? "" };
  return mobileOk(data);
}
