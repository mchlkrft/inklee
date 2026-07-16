import { useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { X } from "lucide-react-native";
import { isUpdateRecommended } from "@inklee/shared/app-config";
import { useAppConfig } from "@/lib/capabilities";
import { APP_VERSION } from "@/lib/app-info";
import { useColors } from "@/lib/theme";

// Soft-update nudge (docs/architecture/remote-config-plan.md §12): shown when
// the server's recommendedVersion is newer than this build. Dismissible per
// version value, in memory — it may reappear next launch, which is the point
// of a nudge; only minVersion hard-blocks.
const dismissedVersions = new Set<string>();

export function UpdateRecommendedBanner() {
  const config = useAppConfig();
  const colors = useColors();
  const [, bump] = useState(0);

  const target = config.recommendedVersion;
  if (
    !target ||
    !isUpdateRecommended(APP_VERSION, target) ||
    dismissedVersions.has(target)
  ) {
    return null;
  }

  const open = () => {
    if (config.updateUrl) void Linking.openURL(config.updateUrl);
  };

  return (
    <View className="mt-3 flex-row items-center gap-3 rounded-card border-brand border-shell-border bg-glass px-4 py-3">
      <Pressable
        onPress={open}
        disabled={!config.updateUrl}
        className="flex-1 active:opacity-70"
        accessibilityRole="button"
        accessibilityLabel="Update Inklee"
      >
        <Text className="text-body font-medium text-foreground">
          Update available
        </Text>
        <Text className="mt-0.5 text-caption text-shell-dim">
          {config.updateUrl
            ? "A newer version of Inklee is ready. Tap to update."
            : "A newer version of Inklee is ready. Update from where you installed the app."}
        </Text>
      </Pressable>
      <Pressable
        onPress={() => {
          dismissedVersions.add(target);
          bump((n) => n + 1);
        }}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Dismiss update notice"
        className="active:opacity-60"
      >
        <X size={18} color={colors.shell.dim} />
      </Pressable>
    </View>
  );
}
