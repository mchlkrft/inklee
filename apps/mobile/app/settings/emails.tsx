import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { MobileEmailTemplatesResponse } from "@inklee/shared/mobile-api";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { ErrorState } from "@/components/ErrorState";
import { useApiQuery } from "@/lib/api";
import { useScreenView } from "@/lib/analytics";
import { useColors } from "@/lib/theme";

const MONO = Platform.select({ ios: "Menlo", default: "monospace" });

// Emails settings — the five per-status booking email templates, mirroring the
// web /settings/emails list (label + Edited chip + mono subject + On/Off).
// Tapping a row opens the native template editor. The reminders card that
// shares the web page is a later slice.
export default function EmailsScreen() {
  useScreenView("settings_emails");
  const router = useRouter();
  const themed = useColors();
  const q = useApiQuery<MobileEmailTemplatesResponse>(
    "/settings/email-templates",
  );

  if (!q.data) {
    return (
      <Screen edges={["left", "right"]}>
        <View className="flex-1 items-center justify-center">
          {q.loading ? (
            <ActivityIndicator color={themed.accent} />
          ) : (
            <ErrorState
              title="Couldn't load email templates"
              subtitle={q.error ?? undefined}
              onRetry={q.refresh}
            />
          )}
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={["left", "right"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={q.refreshing}
            onRefresh={q.refresh}
            tintColor={themed.accent}
          />
        }
      >
        <Text className="mb-4 text-sm text-shell-dim">
          Customize the emails sent for each booking status. Tap a template to
          edit its content.
        </Text>

        <Card>
          {q.data.items.map((tpl, i) => (
            <Pressable
              key={tpl.type}
              accessibilityRole="button"
              onPress={() =>
                router.push(`/settings/email-templates/${tpl.type}`)
              }
              className={`flex-row items-center justify-between py-3 active:opacity-70 ${
                i > 0 ? "border-t border-shell-border" : ""
              }`}
            >
              <View className="flex-1 pr-3">
                <View className="flex-row items-center gap-2">
                  <Text
                    className="shrink text-base text-foreground"
                    numberOfLines={1}
                  >
                    {tpl.label}
                  </Text>
                  {tpl.edited ? (
                    <View className="rounded-full border border-shell-border px-1.5 py-0.5">
                      <Text className="text-[10px] text-shell-dim">Edited</Text>
                    </View>
                  ) : null}
                </View>
                <Text
                  className="mt-0.5 text-xs text-shell-dim"
                  style={{ fontFamily: MONO }}
                  numberOfLines={1}
                >
                  {tpl.subject}
                </Text>
              </View>
              <View className="flex-row items-center gap-1.5">
                <Text
                  className={`text-sm ${
                    tpl.enabled ? "text-foreground" : "text-shell-mute"
                  }`}
                >
                  {tpl.enabled ? "On" : "Off"}
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={themed.shell.mute}
                />
              </View>
            </Pressable>
          ))}
        </Card>
      </ScrollView>
    </Screen>
  );
}
