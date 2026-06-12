import { useEffect, useState } from "react";
import { ActivityIndicator, Switch, Text, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { ErrorState } from "@/components/ErrorState";
import { useApiQuery, apiPost } from "@/lib/api";
import { useColors } from "@/lib/theme";
import { useScreenView } from "@/lib/analytics";
import type { DashboardWidgets } from "@inklee/shared/dashboard-settings";

// Mirrors the web /settings/dashboard widgets form: five toggles over the home
// dashboard widgets, saved via POST /api/mobile/settings/dashboard. The Home tab
// reads the same flags off /api/mobile/home to drive widget visibility.
const ROWS: { key: keyof DashboardWidgets; label: string }[] = [
  { key: "pending_requests", label: "Pending requests" },
  { key: "upcoming_appointments", label: "Upcoming appointments" },
  { key: "guest_spots", label: "Upcoming guest spots" },
  { key: "waitlist", label: "Waitlist" },
  { key: "booking_link", label: "Booking link" },
];

export default function DashboardSettingsScreen() {
  useScreenView("settings_dashboard");
  const colors = useColors();
  const queryClient = useQueryClient();
  const q = useApiQuery<DashboardWidgets>("/settings/dashboard");
  const [widgets, setWidgets] = useState<DashboardWidgets | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (q.data && !widgets) setWidgets(q.data);
  }, [q.data, widgets]);

  if (!widgets) {
    return (
      <Screen edges={["left", "right"]}>
        {q.loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <ErrorState
            title="Couldn't load"
            subtitle={q.error ?? undefined}
            onRetry={q.refresh}
          />
        )}
      </Screen>
    );
  }

  const toggle = (key: keyof DashboardWidgets) => {
    setSaved(false);
    setWidgets({ ...widgets, [key]: !widgets[key] });
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiPost("/settings/dashboard", widgets);
      // The Home grid reads these flags off /home; refresh both views so the
      // change shows without an app restart.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["api", "/home"] }),
        queryClient.invalidateQueries({
          queryKey: ["api", "/settings/dashboard"],
        }),
      ]);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen edges={["left", "right"]}>
      <View className="flex-1 pt-3">
        <Text className="mb-3 text-sm text-shell-dim">
          Choose which cards show on your Home dashboard.
        </Text>
        <Card>
          {ROWS.map((r, i) => (
            <View
              key={r.key}
              className={`flex-row items-center justify-between py-3 ${
                i > 0 ? "border-t border-shell-border" : ""
              }`}
            >
              <Text className="text-base text-foreground">{r.label}</Text>
              <Switch
                value={widgets[r.key]}
                onValueChange={() => toggle(r.key)}
                trackColor={{ false: "rgba(0,0,0,0.35)", true: colors.mustard }}
                thumbColor={colors.bone}
                ios_backgroundColor="rgba(0,0,0,0.35)"
              />
            </View>
          ))}
        </Card>
        {error ? <Text className="mt-3 text-xs text-danger">{error}</Text> : null}
        {saved ? (
          <Text className="mt-3 text-xs text-success">Saved.</Text>
        ) : null}
        <View className="mt-5">
          <Button label="Save" onPress={save} loading={saving} />
        </View>
      </View>
    </Screen>
  );
}
