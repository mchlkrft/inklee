import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { isEmailTemplateType } from "@inklee/shared/email-templates";

export const runtime = "nodejs";

// POST /api/mobile/settings/email-templates/toggle { type, enabled } — flip a
// template type in profiles.settings.disabled_emails. Ports
// toggleTemplateAction (settings/emails/actions.ts); merged into the settings
// JSONB, no migration. Like the web action, toggling writes no audit entry.
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
  const { type, enabled } = (raw ?? {}) as {
    type?: unknown;
    enabled?: unknown;
  };
  if (!isEmailTemplateType(type)) {
    return mobileError(400, "Unknown template type.");
  }
  if (typeof enabled !== "boolean") {
    return mobileError(400, "Invalid enabled value.");
  }

  const { data: profile, error: readError } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", userId)
    .single();
  if (readError || !profile) {
    return mobileError(500, readError?.message ?? "Profile not found.");
  }

  const settings = (profile.settings ?? {}) as Record<string, unknown>;
  const disabled = new Set<string>(
    Array.isArray(settings.disabled_emails)
      ? (settings.disabled_emails as string[])
      : [],
  );
  if (enabled) {
    disabled.delete(type);
  } else {
    disabled.add(type);
  }

  const { error } = await supabase
    .from("profiles")
    .update({ settings: { ...settings, disabled_emails: [...disabled] } })
    .eq("id", userId);
  if (error) return mobileError(500, error.message);

  return mobileOk({ enabled });
}
