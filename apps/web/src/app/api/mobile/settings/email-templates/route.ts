import * as Sentry from "@sentry/nextjs";
import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import {
  ALLOWED_VARS,
  DEFAULT_BODIES,
  DEFAULT_SUBJECTS,
  templateBodySchema,
} from "@/lib/email/booking-templates";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { canEditTemplates } from "@/lib/server/entitlement-gates";
import {
  EMAIL_TEMPLATE_TYPES,
  isEmailTemplateType,
} from "@inklee/shared/email-templates";
import type {
  MobileEmailTemplate,
  MobileEmailTemplatesResponse,
} from "@inklee/shared/mobile-api";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

// GET /api/mobile/settings/email-templates — the five per-status booking email
// templates: the artist's saved body (or the system default), the fixed
// subject, an `edited` flag (computed server-side so defaults never ship to
// the client just to diff) and the enabled state from
// profiles.settings.disabled_emails, plus the allowed merge variables.
// Mirrors the data settings/emails/page.tsx computes.
export async function GET(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const [savedRes, profileRes] = await Promise.all([
    supabase
      .from("email_templates")
      .select("type, body")
      .eq("artist_id", userId),
    supabase.from("profiles").select("settings").eq("id", userId).single(),
  ]);
  if (savedRes.error) return mobileError(500, savedRes.error.message);
  if (profileRes.error) return mobileError(500, profileRes.error.message);

  const savedMap = Object.fromEntries(
    (savedRes.data ?? []).map((t) => [t.type as string, t.body as string]),
  );
  const settings = (profileRes.data?.settings ?? {}) as Record<string, unknown>;
  const disabled = new Set<string>(
    Array.isArray(settings.disabled_emails)
      ? (settings.disabled_emails as string[])
      : [],
  );

  const items: MobileEmailTemplate[] = EMAIL_TEMPLATE_TYPES.map(
    ({ type, label }) => {
      const systemDefault = DEFAULT_BODIES[type] ?? "";
      const body = savedMap[type] ?? systemDefault;
      return {
        type,
        label,
        subject: DEFAULT_SUBJECTS[type] ?? "",
        body,
        edited: body !== systemDefault,
        enabled: !disabled.has(type),
      };
    },
  );

  const data: MobileEmailTemplatesResponse = {
    items,
    allowedVars: [...ALLOWED_VARS],
  };
  return mobileOk(data);
}

// POST /api/mobile/settings/email-templates { type, body } — save a custom
// body for one template. Ports saveTemplateAction (settings/emails/actions.ts)
// faithfully: same validation, same upsert (subject stays the system default),
// same audit entry, so mobile edits are indistinguishable from web edits.
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
  const { type, body } = (raw ?? {}) as { type?: unknown; body?: unknown };
  if (!isEmailTemplateType(type)) {
    return mobileError(400, "Unknown template type.");
  }
  if (typeof body !== "string") {
    return mobileError(400, "Body is required");
  }

  const parsed = templateBodySchema.safeParse(body.trim());
  if (!parsed.success) return mobileError(400, parsed.error.issues[0].message);

  // Entitlement gate (BM-2.0, same as saveTemplateAction). Dark-launched via
  // custom_templates; the send path stays ungated so existing bodies keep going
  // out. Fail OPEN on a plan-read blip so a paused capability stays inert.
  try {
    const overrides = await getAccountOverrides(userId);
    if (!canEditTemplates(overrides)) {
      return mobileError(
        403,
        "Custom email templates are a Plus feature. Upgrade to Plus to edit them.",
        "not_entitled",
      );
    }
  } catch (e) {
    Sentry.captureException(e, {
      tags: { action: "custom_templates_gate_mobile" },
      extra: { artistId: userId },
    });
  }

  const subject = DEFAULT_SUBJECTS[type] ?? "inklee";

  const { error } = await supabase
    .from("email_templates")
    .upsert(
      { artist_id: userId, type, subject, body: parsed.data },
      { onConflict: "artist_id,type" },
    );
  if (error) return mobileError(500, error.message);

  void writeAudit({
    action: "email_template_edited",
    actor: userId,
    category: "settings",
    details: { template_type: type },
  });

  return mobileOk({ ok: true });
}
