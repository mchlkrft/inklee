import type { ReactNode } from "react";
import { Text, View } from "react-native";

// Screen title (display type) + optional subtitle + optional trailing action.
// Replaces the inline <Text> screen titles (e.g. more.tsx) and mirrors the web
// h1 + subtitle page-header pattern that anchors every web screen's hierarchy.
export function PageHeader({
  title,
  subtitle,
  trailing,
}: {
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
}) {
  return (
    <View className="mb-5 flex-row items-start justify-between gap-3">
      <View className="flex-1">
        <Text className="text-display font-bold text-bone">{title}</Text>
        {subtitle ? (
          <Text className="mt-1 text-subtitle text-shell-dim">{subtitle}</Text>
        ) : null}
      </View>
      {trailing ?? null}
    </View>
  );
}
