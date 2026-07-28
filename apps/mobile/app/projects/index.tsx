import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import type { MobileProjectList } from "@inklee/shared/mobile-api";
import {
  PROJECT_STATUS_META,
  BODY_AREAS,
  PROJECT_SCALES,
  labelForKey,
} from "@inklee/shared/projects";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { ErrorState } from "@/components/ErrorState";
import { SectionLabel } from "@/components/SectionLabel";
import { useApiQuery } from "@/lib/api";
import { useColors } from "@/lib/theme";
import { useScreenView } from "@/lib/analytics";

// Large-project mode, native list (Plus build P4). The twin of
// /bookings/projects. Reading is never entitlement-gated, so this screen
// always shows what the artist has; `entitled` only decides whether the
// enquiry link or the Plus note appears.

export default function ProjectsScreen() {
  useScreenView("projects");
  const router = useRouter();
  const c = useColors();
  const q = useApiQuery<MobileProjectList>("/projects");

  if (!q.data) {
    return (
      <Screen edges={["left", "right"]}>
        <View className="flex-1 items-center justify-center">
          {q.loading ? (
            <ActivityIndicator color={c.accent} />
          ) : (
            <ErrorState
              title="Couldn't load your projects"
              subtitle={q.error ?? undefined}
              onRetry={q.refresh}
            />
          )}
        </View>
      </Screen>
    );
  }

  const { projects, entitled, intakeUrl } = q.data;

  return (
    <Screen edges={["left", "right"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 48 }}
      >
        <Text className="mb-4 text-sm text-shell-dim">
          Sleeves, back pieces and anything that runs over several sessions.
        </Text>

        {entitled && intakeUrl ? (
          <Card>
            <Text className="text-sm text-foreground">Your enquiry link</Text>
            <Text className="mt-1 text-sm text-shell-dim" selectable>
              {intakeUrl}
            </Text>
          </Card>
        ) : (
          <Card>
            {/* No price, no purchase step: D17 keeps the app clear of
                anything that reads as steering toward a purchase. */}
            <Text className="text-sm text-shell-dim">
              Large-project enquiries are part of Plus. Projects you already
              have stay here and keep working.
            </Text>
          </Card>
        )}

        <SectionLabel>Open</SectionLabel>
        {projects.length === 0 ? (
          <Text className="text-sm text-shell-dim">Nothing open.</Text>
        ) : (
          <Card>
            {projects.map((p, i) => (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                onPress={() => router.push(`/projects/${p.id}`)}
                className={`py-3 active:opacity-70 ${
                  i > 0 ? "border-t border-shell-border" : ""
                }`}
              >
                <View className="flex-row items-center gap-2">
                  <Text className="flex-1 text-base font-semibold text-foreground">
                    {p.title}
                  </Text>
                  <Text className="text-xs text-shell-mute">
                    {PROJECT_STATUS_META[p.status]?.label ?? p.status}
                  </Text>
                </View>
                <Text className="mt-0.5 text-sm text-shell-dim">
                  {p.customerEmail}
                  {" · "}
                  {labelForKey(PROJECT_SCALES, p.scale)}
                  {p.bodyAreas.length > 0 &&
                    ` · ${p.bodyAreas
                      .map((a) => labelForKey(BODY_AREAS, a))
                      .filter(Boolean)
                      .join(", ")}`}
                </Text>
              </Pressable>
            ))}
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}
