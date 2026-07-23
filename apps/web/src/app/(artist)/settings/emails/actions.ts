"use server";

import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import {
  templateBodySchema,
  DEFAULT_SUBJECTS,
} from "@/lib/email/booking-templates";
import { revalidatePath } from "next/cache";
import { writeAudit } from "@/lib/audit";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { canEditTemplates } from "@/lib/server/entitlement-gates";

type State = { error: string } | { success: true } | null;

type EmailType =
  | "customer_booking_submitted"
  | "customer_booking_approved"
  | "customer_booking_rejected"
  | "customer_booking_cancelled_by_artist"
  | "artist_new_booking_request";

export async function saveTemplateAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const type = formData.get("type") as EmailType;
  const body = (formData.get("body") as string).trim();

  const parsed = templateBodySchema.safeParse(body);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // Entitlement gate (BM-2.0): editing a custom template body is a Plus feature.
  // Dark-launched via custom_templates; existing bodies always keep SENDING (the
  // send path is never gated). Fail OPEN on a plan-read blip (like the cap
  // gates), so a PAUSED capability stays fully inert (canEditTemplates reads the
  // pause) and a live blip never blocks a legit edit.
  try {
    const overrides = await getAccountOverrides(user.id);
    if (!canEditTemplates(overrides)) {
      return {
        error:
          "Custom email templates are a Plus feature. Upgrade to Plus to edit them.",
      };
    }
  } catch (e) {
    Sentry.captureException(e, {
      tags: { action: "custom_templates_gate" },
      extra: { artistId: user.id },
    });
  }

  const subject = DEFAULT_SUBJECTS[type] ?? "inklee";

  const { error } = await supabase
    .from("email_templates")
    .upsert(
      { artist_id: user.id, type, subject, body: parsed.data },
      { onConflict: "artist_id,type" },
    );

  if (error) return { error: error.message };

  void writeAudit({
    action: "email_template_edited",
    actor: user.id,
    category: "settings",
    details: { template_type: type },
  });

  revalidatePath("/settings/emails");
  return { success: true };
}

export async function resetTemplateAction(type: EmailType): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase
    .from("email_templates")
    .delete()
    .eq("artist_id", user.id)
    .eq("type", type);

  if (error) return { error: error.message };

  void writeAudit({
    action: "email_template_reset",
    actor: user.id,
    category: "settings",
    details: { template_type: type },
  });

  revalidatePath("/settings/emails");
  return { success: true };
}

export async function toggleTemplateAction(
  type: EmailType,
  enabled: boolean,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", user.id)
    .single();

  const settings = (profile?.settings ?? {}) as Record<string, unknown>;
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
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/settings/emails");
  return { success: true };
}
