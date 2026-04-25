import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_BODIES,
  DEFAULT_SUBJECTS,
  ALLOWED_VARS,
} from "@/lib/email/booking-templates";
import { parseReminderSettings } from "@/lib/reminder-settings";
import TemplateEditor from "./template-editor";
import RemindersForm from "../reminders/reminders-form";

const TEMPLATE_TYPES = [
  {
    type: "customer_booking_submitted",
    label: "Booking received (to customer)",
  },
  {
    type: "customer_booking_approved",
    label: "Booking approved (to customer)",
  },
  {
    type: "customer_booking_rejected",
    label: "Booking rejected (to customer)",
  },
  {
    type: "customer_booking_cancelled_by_artist",
    label: "You cancelled (to customer)",
  },
  {
    type: "artist_new_booking_request",
    label: "New request (to you)",
  },
] as const;

export default async function TemplatesPage() {
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

  return (
    <div className="space-y-12 max-w-2xl">
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Emails</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Customize email templates and configure automated reminders.
          </p>
        </div>

        <section className="space-y-4">
          <div className="border-b-2 border-border pb-2">
            <h2 className="text-base font-semibold text-foreground">
              Email templates
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Customize the body of each email. Subject lines and layout are
              fixed.
            </p>
            <p className="text-xs text-muted-foreground mt-1.5">
              Available variables:{" "}
              {ALLOWED_VARS.map((v) => (
                <code key={v} className="mr-1.5 font-mono">{`{{${v}}}`}</code>
              ))}
            </p>
          </div>
          <div className="space-y-6">
            {TEMPLATE_TYPES.map(({ type, label }) => (
              <div
                key={type}
                className="rounded-md border border-border p-5 space-y-3"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Subject:{" "}
                    <span className="font-mono">{DEFAULT_SUBJECTS[type]}</span>
                  </p>
                </div>
                <TemplateEditor
                  type={type}
                  defaultBody={savedMap[type] ?? DEFAULT_BODIES[type] ?? ""}
                  systemDefault={DEFAULT_BODIES[type] ?? ""}
                  defaultEnabled={!disabledSet.has(type)}
                />
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <div className="border-b-2 border-border pb-2">
            <h2 className="text-base font-semibold text-foreground">
              Reminders
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Configure when automated emails are sent to clients.
            </p>
          </div>
          <RemindersForm settings={reminderSettings} />
        </section>
      </div>
    </div>
  );
}
