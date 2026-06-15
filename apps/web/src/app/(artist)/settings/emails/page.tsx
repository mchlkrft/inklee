import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_BODIES,
  DEFAULT_SUBJECTS,
  ALLOWED_VARS,
} from "@/lib/email/booking-templates";
import { EMAIL_TEMPLATE_TYPES } from "@inklee/shared/email-templates";
import { parseReminderSettings } from "@/lib/reminder-settings";
import RemindersForm from "../reminders/reminders-form";
import EmailTemplatesList from "./email-templates-list";
import type { TemplateData } from "./email-templates-list";

// Template types + labels live in @inklee/shared/email-templates (shared with
// the mobile app and the /api/mobile routes) so the lists cannot drift.
const TEMPLATE_TYPES = EMAIL_TEMPLATE_TYPES;

export default async function EmailsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: saved }, { data: profile }] = await Promise.all([
    supabase
      .from("email_templates")
      .select("type, body")
      .eq("artist_id", user!.id),
    supabase.from("profiles").select("settings").eq("id", user!.id).single(),
  ]);

  const savedMap = Object.fromEntries(
    (saved ?? []).map((t) => [t.type, t.body]),
  );

  const settings = (profile?.settings ?? {}) as Record<string, unknown>;
  const disabledSet = new Set<string>(
    Array.isArray(settings.disabled_emails)
      ? (settings.disabled_emails as string[])
      : [],
  );
  const reminderSettings = parseReminderSettings(settings.reminder_settings);

  const templates: TemplateData[] = TEMPLATE_TYPES.map(({ type, label }) => ({
    type,
    label,
    subject: DEFAULT_SUBJECTS[type] ?? "",
    body: savedMap[type] ?? DEFAULT_BODIES[type] ?? "",
    systemDefault: DEFAULT_BODIES[type] ?? "",
    enabled: !disabledSet.has(type),
  }));

  return (
    <div className="space-y-10 max-w-2xl">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Emails
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Customize email templates and configure automated reminders.
        </p>
      </div>

      <section className="space-y-4">
        <div className="border-b border-border pb-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Email templates
          </h2>
          <p className="mt-1.5 text-sm text-foreground">
            Click a template to edit its content.
          </p>
        </div>
        <EmailTemplatesList
          templates={templates}
          allowedVars={[...ALLOWED_VARS]}
        />
      </section>

      <section className="space-y-4">
        <div className="border-b border-border pb-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Reminders
          </h2>
          <p className="mt-1.5 text-sm text-foreground">
            Choose when automated emails go out to clients.
          </p>
        </div>
        <RemindersForm settings={reminderSettings} />
      </section>
    </div>
  );
}
