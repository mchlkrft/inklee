import { createClient } from "@/lib/supabase/server";
import { parseReminderSettings } from "@/lib/reminder-settings";
import RemindersForm from "./reminders-form";

export default async function RemindersSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", user!.id)
    .single();

  const profileSettings = (profile?.settings ?? {}) as Record<string, unknown>;
  const settings = parseReminderSettings(profileSettings.reminder_settings);

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h1 className="text-lg font-semibold text-foreground">reminders</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          configure when automated emails are sent to clients
        </p>
      </div>
      <RemindersForm settings={settings} />
    </div>
  );
}
