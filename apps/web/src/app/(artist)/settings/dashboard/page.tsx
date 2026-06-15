import { createClient } from "@/lib/supabase/server";
import DashboardWidgetsForm from "./widgets-form";
import { parseDashboardWidgets } from "@/lib/dashboard-settings";

export default async function DashboardSettingsPage() {
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
  const widgets = parseDashboardWidgets(profileSettings.dashboard_widgets);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose which widgets appear on your dashboard overview.
        </p>
      </div>
      <DashboardWidgetsForm widgets={widgets} />
    </div>
  );
}
