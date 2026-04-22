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
    <div className="space-y-6 max-w-lg">
      <div>
        <h1 className="text-lg font-semibold text-foreground">dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          choose which widgets appear on your dashboard overview
        </p>
      </div>
      <DashboardWidgetsForm widgets={widgets} />
    </div>
  );
}
